"use client";

import { AlertCircle, Loader } from "lucide-react";
import { useState } from "react";
import type { ProductInfo as ProductInfoType } from "../types/photo-workflow";

interface ProductInfoProps {
  productInfo: ProductInfoType | null;
  extracting: boolean;
  error: string | null;
  onUpdate: (updatedInfo: ProductInfoType) => void;
}

export function ProductInfo({
  productInfo,
  extracting,
  error,
  onUpdate,
}: ProductInfoProps) {
  const [editingField, setEditingField] = useState<keyof ProductInfoType | null>(
    null
  );
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (field: keyof ProductInfoType) => {
    setEditingField(field);
    const value = productInfo?.[field];
    if (typeof value === "string" || typeof value === "number") {
      setEditValue(String(value));
    }
  };

  const handleSaveEdit = () => {
    if (!productInfo || editingField === null) return;

    const updated = { ...productInfo };
    if (editingField === "price" || editingField === "estimatedValue") {
      updated[editingField] = parseFloat(editValue) || 0;
    } else if (editingField === "tags" || editingField === "keyFeatures") {
      updated[editingField] = editValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      (updated[editingField] as string) = editValue;
    }

    onUpdate(updated);
    setEditingField(null);
    setEditValue("");
  };

  if (extracting) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 2: Product Details
        </h2>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <Loader className="w-5 h-5 animate-spin" />
            <span className="font-medium">
              AI is analyzing your photo and extracting product details...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 2: Product Details
        </h2>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-600 dark:text-red-400 mb-1">
              Extraction failed
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!productInfo) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 2: Product Details
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Upload a photo to see extracted product details
        </p>
      </div>
    );
  }

  const EditableField = ({
    label,
    field,
    value,
    type = "text",
  }: {
    label: string;
    field: keyof ProductInfoType;
    value: string | number | string[];
    type?: string;
  }) => {
    const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
    const isEditing = editingField === field;

    return (
      <div className="py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {label}
          </label>
          {!isEditing && (
            <button
              onClick={() => handleStartEdit(field)}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2 flex gap-2">
            <input
              type={type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1.5 bg-blue-600 dark:bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditingField(null)}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="mt-1 text-gray-900 dark:text-white font-medium">
            {displayValue || "-"}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Step 2: Product Details
      </h2>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <EditableField
              label="Title"
              field="title"
              value={productInfo.title}
            />
            <EditableField
              label="Category"
              field="category"
              value={productInfo.category}
            />
            <EditableField
              label="Condition"
              field="condition"
              value={productInfo.condition}
            />
          </div>

          <div>
            <EditableField
              label="Price"
              field="price"
              value={productInfo.price}
              type="number"
            />
            {productInfo.estimatedValue && (
              <EditableField
                label="Estimated Value"
                field="estimatedValue"
                value={productInfo.estimatedValue}
                type="number"
              />
            )}
          </div>
        </div>

        <div>
          <EditableField
            label="Description"
            field="description"
            value={productInfo.description}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <EditableField
              label="Key Features"
              field="keyFeatures"
              value={productInfo.keyFeatures}
            />
          </div>
          <div>
            <EditableField label="Tags" field="tags" value={productInfo.tags} />
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          💡 Click "Edit" on any field to customize the details before posting
        </p>
      </div>
    </div>
  );
}
