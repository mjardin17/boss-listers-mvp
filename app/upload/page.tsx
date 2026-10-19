import { Metadata } from "next";
import { PhotoUploadWorkflow } from "../../components/PhotoUploadWorkflow";

export const metadata: Metadata = {
  title: "Photo Upload - Boss Listers",
  description: "Upload a photo and post to all marketplaces and social platforms",
};

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Photo → Everywhere
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Upload one photo and automatically post to all your connected marketplaces and social platforms
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-950 px-6 py-12">
        <PhotoUploadWorkflow />
      </div>
    </div>
  );
}
