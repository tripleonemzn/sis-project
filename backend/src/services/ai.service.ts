import OpenAI from 'openai';

class AiService {
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  public isAvailable(): boolean {
    return !!this.openai;
  }

  public async analyzeCp(text: string, context?: { subject?: string; phase?: string; level?: string }): Promise<{
    competencies: string[];
    materials: string[];
    summary: string;
  }> {
    if (!this.openai) {
      throw new Error('Layanan AI tidak dikonfigurasi (API Key missing)');
    }

    const systemPrompt = `Bertindaklah kamu sebagai Kurator Kurikulum SMK. Saya akan memberikan teks Capaian Pembelajaran (CP) dari Keputusan BSKAP.
 
Tugas Anda:
1. Identifikasi Kompetensi Utama (kata kerja operasional) yang harus dikuasai siswa.
2. Identifikasi Lingkup Materi (konten esensial) yang relevan dengan kebutuhan industri SMK saat ini.
3. Buatkan ringkasan deskripsi CP yang lebih sederhana untuk dicantumkan dalam dokumen perangkat ajar.

Output wajib format JSON valid tanpa markdown code block:
{
  "competencies": ["..."],
  "materials": ["..."],
  "summary": "..."
}`;

    let userContent = text;
    if (context) {
      userContent = `[Konteks Pembelajaran]
Mata Pelajaran: ${context.subject || '-'}
Fase: ${context.phase || '-'}
Kelas: ${context.level || '-'}

[Teks CP]
${text}`;
    }

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost effective
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error('Gagal mendapatkan respon dari AI');
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error('Format respon AI tidak valid');
    }
  }
}

export const aiService = new AiService();
