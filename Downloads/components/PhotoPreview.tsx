"use client";

import { Upload, X, AlertCircle } from "lucide-react";
import { useCallback, useRef } from "react";

interface PhotoPreviewProps {
  photo: File | null;
  preview: string | null;
  onPhotoChange: (file: File | null) => void;
  onPreviewChange: (preview: string | null) => void;
  disabled?: boolean;
  extracting?: boolean;
}

export function PhotoPreview({
  photo,
  preview,
  onPhotoChange,
  onPreviewChange,
  disabled = false,
  extracting = false,
}: PhotoPreviewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef(false);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        console.error("Please select an image file");
        return;
      }

      // 10MB limit
      if (file.size > 10 * 1024 * 1024) {
        console.error("Image must be less than 10MB");
        return;
      }

      onPhotoChange(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === "string") {
          onPreviewChange(e.target.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [onPhotoChange, onPreviewChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragOverRef.current = true;
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragOverRef.current = false;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragOverRef.current = false;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = () => {
    onPhotoChange(null);
    onPreviewChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Step 1: Upload Photo
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Upload a photo of your item. We'll automatically extract product details using AI.
        </p>
      </div>

      {!preview ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            disabled || extracting
              ? "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
              : "border-blue-300 bg-blue-50 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 hover:dark:bg-blue-900/30 cursor-pointer"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !extracting && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            disabled={disabled || extracting}
            className="hidden"
          />

          <Upload className="w-12 h-12 mx-auto mb-4 text-blue-600 dark:text-blue-400" />
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            Drag and drop your photo here
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            or click to select a file
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Supported formats: JPG, PNG, WebP • Max size: 10MB
          </p>

          {extracting && (
            <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent"></div>
              <span className="text-sm font-medium">Uploading...</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <img
            src={preview}
            alt="Product preview"
            className="w-full h-auto max-h-96 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
          />

          {extracting && (
            <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center">
              <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Extracting details...
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || extracting}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Change Photo
            </button>
            <button
              onClick={handleRemove}
              disabled={disabled || extracting}
              className="flex-1 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
