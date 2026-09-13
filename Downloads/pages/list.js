"use client";

import { PhotoUploadWorkflow } from "../components/PhotoUploadWorkflow";

export default function ListPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">List Item Everywhere</h1>
          <p className="text-slate-600 mt-2">Upload a photo to auto-list across 25+ marketplaces</p>
        </div>
        <PhotoUploadWorkflow />
      </div>
    </div>
  );
}
