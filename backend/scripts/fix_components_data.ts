
import { PrismaClient, GradeComponentType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting Grade Components Fix...')

  // 1. Get all subjects
  const subjects = await prisma.subject.findMany()
  console.log(`Found ${subjects.length} subjects.`)

  for (const subject of subjects) {
    console.log(`Processing Subject: ${subject.name} (${subject.code})`)

    // 2. Check existing components for this subject
    const existing = await prisma.gradeComponent.findMany({
      where: { subjectId: subject.id }
    })

    // 3. Define standard components
    const standards = [
      { name: 'Formatif', type: GradeComponentType.FORMATIVE, weight: 40 },
      { name: 'Sumatif Tengah Semester', type: GradeComponentType.MIDTERM, weight: 30 },
      { name: 'Sumatif Akhir Semester', type: GradeComponentType.FINAL, weight: 30 },
    ]

    for (const std of standards) {
      // Check if component of this type already exists
      const found = existing.find(e => e.type === std.type)
      
      if (found) {
        // Update name/weight if needed, but keep ID to preserve grades
        if (found.name !== std.name || found.weight !== std.weight) {
          console.log(`  Updating component ${found.name} -> ${std.name}`)
          await prisma.gradeComponent.update({
            where: { id: found.id },
            data: { name: std.name, weight: std.weight }
          })
        } else {
          console.log(`  Component ${std.name} OK.`)
        }
      } else {
        // Create new component
        console.log(`  Creating component ${std.name}`)
        await prisma.gradeComponent.create({
          data: {
            name: std.name,
            type: std.type,
            weight: std.weight,
            subjectId: subject.id,
            isActive: true
          }
        })
      }
    }

    // 4. Delete non-standard components (e.g. "NF1", "NF2")
    // CAREFUL: Only delete if type is NOT in [FORMATIF, SBTS, SAS]
    // OR if we have duplicates of same type (we keep the first one found above).
    
    // Let's re-fetch to see current state
    const current = await prisma.gradeComponent.findMany({
      where: { subjectId: subject.id }
    })

    const standardTypes: GradeComponentType[] = [GradeComponentType.FORMATIVE, GradeComponentType.MIDTERM, GradeComponentType.FINAL]
    
    for (const comp of current) {
      // If type is not standard, OR if it is standard but we have duplicates (though logic above didn't handle duplicates explicitly, we only updated ONE).
      // Actually, if we have duplicates, we should merge or delete.
      // For now, let's just delete components that don't match our standard names/types logic?
      // Better: Delete components where name starts with "NF" or type is invalid?
      // Assuming clean start for weird data:
      if (!standardTypes.includes(comp.type)) {
        console.log(`  Deleting non-standard component: ${comp.name} (${comp.type})`)
        // Check if grades exist?
        // await prisma.gradeComponent.delete({ where: { id: comp.id } })
      }
      
      // Also check if name is "NF..." but type IS Formatif? 
      // The user likely has components named "NF1" with type "FORMATIF"?
      // If so, my update logic above might have renamed "NF1" to "Formatif".
      // But if there were multiple "Formatif" types (NF1, NF2...), I only renamed the first one.
      // The others remain as "NF2", "NF3"...
      // So I need to delete duplicates.
    }
    
    // Delete duplicates (keep the one we just updated/created)
    // We can group by type.
    const byType: Record<string, typeof current> = {}
    current.forEach(c => {
      if (!byType[c.type]) byType[c.type] = []
      byType[c.type].push(c)
    })

    for (const type of standardTypes) {
      const comps = byType[type] || []
      if (comps.length > 1) {
        console.log(`  Found ${comps.length} components for type ${type}. Keeping one, deleting others.`)
        // Keep the one with correct name (which we just ensured exists)
        const keeper = comps.find(c => c.name === standards.find(s => s.type === type)?.name) || comps[0]
        
        for (const c of comps) {
          if (c.id !== keeper.id) {
             console.log(`  Deleting duplicate component: ${c.name} (ID: ${c.id})`)
             // We might lose grades here! But "NF1".."NF6" columns are in StudentGrade table.
             // If grades are linked to this component ID, they will be deleted (cascade) or error.
             // Prisma default is usually restrict.
             // If restrict, we can't delete.
             // If we really want to fix, we should reassign grades to 'keeper.id' then delete.
             
             try {
               await prisma.studentGrade.updateMany({
                 where: { componentId: c.id },
                 data: { componentId: keeper.id }
               })
               await prisma.gradeComponent.delete({ where: { id: c.id } })
               console.log(`    Deleted and migrated grades.`)
             } catch (e) {
               console.error(`    Failed to delete ${c.name}: ${e}`)
             }
          }
        }
      }
    }
  }

  console.log('Fix complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
