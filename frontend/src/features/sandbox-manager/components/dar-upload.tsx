import React, { useCallback, useState, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Upload04Icon,
  FileZipIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DAR Upload Component
// ---------------------------------------------------------------------------

// 256 MB -- DAR files above this size should not be uploaded via the browser
const MAX_DAR_SIZE_BYTES = 256 * 1024 * 1024;

export interface DarUploadProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadProgress?: number;
  lastUploadedFileName?: string;
}

export function DarUpload({
  onUpload,
  isUploading,
  uploadProgress,
  lastUploadedFileName,
}: DarUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndAccept = useCallback(
    (file: File) => {
      setSizeError(null);
      if (!file.name.endsWith(".dar")) {
        return;
      }
      if (file.size > MAX_DAR_SIZE_BYTES) {
        setSizeError(
          `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is ${MAX_DAR_SIZE_BYTES / (1024 * 1024)} MB.`
        );
        return;
      }
      setSelectedFile(file);
      onUpload(file);
    },
    [onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        validateAndAccept(files[0]);
      }
    },
    [validateAndAccept]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        validateAndAccept(files[0]);
      }
    },
    [validateAndAccept]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setSizeError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
          isUploading && "pointer-events-none opacity-60"
        )}
      >
        {isUploading ? (
          <>
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Uploading DAR...
            </span>
            {uploadProgress !== undefined && (
              <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} className="size-8 text-muted-foreground/50" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Drop a DAR file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Accepts .dar files (Daml Archive)
              </p>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".dar"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* File size error */}
      {sizeError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {sizeError}
        </div>
      )}

      {/* Selected / uploaded file info */}
      {selectedFile && !isUploading && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-xs font-medium">
            {selectedFile.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClearFile();
            }}
            className="rounded p-0.5 hover:bg-muted"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Last uploaded success */}
      {lastUploadedFileName && !isUploading && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3.5" />
          <span>
            Successfully uploaded{" "}
            <span className="font-medium">{lastUploadedFileName}</span>
          </span>
          <Badge variant="secondary" className="text-[10px]">
            Source extracted
          </Badge>
        </div>
      )}
    </div>
  );
}
