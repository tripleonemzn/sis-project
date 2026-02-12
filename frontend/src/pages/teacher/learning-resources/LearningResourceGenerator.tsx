interface LearningResourceGeneratorProps {
  type: string;
  title: string;
  description: string;
}

export const LearningResourceGenerator = ({ type, title, description }: LearningResourceGeneratorProps) => {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-4">{description}</p>
      <div className="bg-white p-4 rounded border border-gray-200">
        <p className="text-sm text-gray-500">Generator implementation for {type} coming soon.</p>
      </div>
    </div>
  );
};

export default LearningResourceGenerator;
