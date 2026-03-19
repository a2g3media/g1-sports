/**
 * BetUploadPage - Screenshot upload for bet ticket parsing
 * Supports drag & drop and file selection
 * Includes tier-based upload limits with explainer modal
 * @module BetUploadPage
 */

import * as React from "react";
const { useState, useRef, useCallback, useEffect } = React;
import { useNavigate, Link } from "react-router-dom";
import {
  Upload,
  Image as ImageIcon,
  Camera,
  ArrowLeft,
  X,
  Sparkles,
  FileImage,
  Plus,
  AlertCircle,
  Clock,
  Crown,
  Zap,
  Lock,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// =====================================================
// CONSTANTS
// =====================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const SPORTSBOOK_HINTS = [
  "FanDuel",
  "DraftKings",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Bet365",
  "Barstool",
];

// =====================================================
// UPLOAD LIMIT TYPES
// =====================================================

interface UploadLimitInfo {
  canUpload: boolean;
  uploadsUsed: number;
  maxUploads: number | null;
  windowHours: number;
  nextUploadAt: string | null;
  tier: string;
  tierDisplayName: string;
}

// =====================================================
// UPGRADE MODAL COMPONENT
// =====================================================

interface UpgradeLimitModalProps {
  limitInfo: UploadLimitInfo;
  onClose: () => void;
  onUpgrade: () => void;
}

function UpgradeLimitModal({ limitInfo, onClose, onUpgrade }: UpgradeLimitModalProps) {
  const timeUntilNext = limitInfo.nextUploadAt 
    ? formatTimeUntil(new Date(limitInfo.nextUploadAt))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" />
        
        <div className="relative p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 mb-2">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Upload Limit Reached</h2>
            <p className="text-sm text-slate-400">
              {limitInfo.tierDisplayName} tier allows {limitInfo.maxUploads} upload{limitInfo.maxUploads === 1 ? '' : 's'} per{' '}
              {limitInfo.windowHours === 24 ? 'day' : 'week'}
            </p>
          </div>

          {/* Time remaining */}
          {timeUntilNext && (
            <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <Clock className="w-5 h-5 text-blue-400" />
              <div className="text-center">
                <p className="text-sm text-slate-400">Next upload available in</p>
                <p className="text-lg font-semibold text-slate-200">{timeUntilNext}</p>
              </div>
            </div>
          )}

          {/* Upgrade benefits */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider text-center">
              Upgrade for unlimited uploads
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-slate-300">Unlimited bet slip uploads</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-slate-300">AI-powered tracking & insights</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-slate-300">Real-time coverage alerts</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={onUpgrade}
              className="w-full h-12 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-semibold"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro
            </Button>
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full text-slate-400 hover:text-slate-200"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to format time until next upload
function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  if (diffMs <= 0) return "now";
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
}

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}

// =====================================================
// DROP ZONE COMPONENT
// =====================================================

interface DropZoneProps {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: () => void;
  hasFile: boolean;
}

function DropZone({
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileSelect,
  hasFile,
}: DropZoneProps) {
  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 cursor-pointer",
        "flex flex-col items-center justify-center gap-4 min-h-[300px]",
        isDragging
          ? "border-blue-400 bg-blue-500/10 scale-[1.02]"
          : hasFile
          ? "border-green-500/50 bg-green-500/5"
          : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/30"
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onFileSelect}
    >
      {/* Animated border glow when dragging */}
      {isDragging && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 animate-pulse" />
      )}

      <div
        className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
          isDragging
            ? "bg-blue-500/20 scale-110"
            : "bg-slate-800"
        )}
      >
        <Upload
          className={cn(
            "w-10 h-10 transition-colors",
            isDragging ? "text-blue-400" : "text-slate-400"
          )}
        />
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-slate-200">
          {isDragging ? "Drop your screenshot here" : "Drag & drop your bet slip"}
        </p>
        <p className="text-sm text-slate-400">
          or click to browse • PNG, JPG, WebP up to 10MB
        </p>
      </div>

      <div className="flex items-center gap-4 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-slate-600 hover:border-slate-500"
          onClick={(e) => {
            e.stopPropagation();
            onFileSelect();
          }}
        >
          <FileImage className="w-4 h-4" />
          Browse Files
        </Button>
      </div>
    </div>
  );
}

// =====================================================
// PREVIEW COMPONENT
// =====================================================

interface PreviewProps {
  imageUrl: string;
  fileName: string;
  onRemove: () => void;
  isParsing: boolean;
}

function ImagePreview({ imageUrl, fileName, onRemove, isParsing }: PreviewProps) {
  const [elapsed, setElapsed] = useState(0);
  
  // Track elapsed time during parsing
  useEffect(() => {
    if (!isParsing) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isParsing]);
  
  // Dynamic message based on elapsed time
  const getParsingMessage = () => {
    if (elapsed < 5) return "Analyzing your bet slip...";
    if (elapsed < 15) return "AI is reading selections and odds...";
    if (elapsed < 25) return "Almost there, processing details...";
    return "Taking a bit longer than usual...";
  };
  
  const getSubMessage = () => {
    if (elapsed < 15) return "AI is extracting selections and odds";
    if (elapsed < 25) return "Complex bets take a moment to analyze";
    return "Please wait, this can take up to 30 seconds";
  };
  
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/50">
      {/* Image */}
      <div className="relative aspect-[3/4] max-h-[500px] overflow-hidden">
        <img
          src={imageUrl}
          alt="Bet slip preview"
          className={cn(
            "w-full h-full object-contain",
            isParsing && "opacity-50"
          )}
        />
        
        {/* Parsing overlay */}
        {isParsing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-slate-900" />
              <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-blue-400" />
            </div>
            <p className="mt-4 text-lg font-medium text-slate-200">{getParsingMessage()}</p>
            <p className="text-sm text-slate-400">{getSubMessage()}</p>
            {elapsed >= 5 && (
              <p className="mt-2 text-xs text-slate-500">{elapsed}s elapsed</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 border-t border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">{fileName}</p>
            <p className="text-xs text-slate-400">Ready for AI parsing</p>
          </div>
        </div>
        
        {!isParsing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

function BetUploadPage() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Upload limit state
  const [uploadLimit, setUploadLimit] = useState<UploadLimitInfo | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [isCheckingLimit, setIsCheckingLimit] = useState(true);

  // Check upload limits on mount
  // TODO: Re-enable limit checking after testing phase
  useEffect(() => {
    // TESTING MODE: Skip limit check, allow unlimited uploads
    setUploadLimit({
      canUpload: true,
      uploadsUsed: 0,
      maxUploads: 999,
      windowHours: 168,
      tier: "testing",
      tierDisplayName: "Testing Mode",
      nextUploadAt: null,
    });
    setIsCheckingLimit(false);
    
    /* Original limit check - uncomment after testing:
    async function checkLimit() {
      if (!user) {
        setIsCheckingLimit(false);
        return;
      }
      
      try {
        const response = await fetch("/api/bet-tickets/upload-limit", {
          headers: user?.id ? { "x-user-id": user.id.toString() } : {},
        });
        if (response.ok) {
          const limitInfo = await response.json();
          setUploadLimit(limitInfo);
          
          // Show modal if at limit
          if (!limitInfo.canUpload) {
            setShowLimitModal(true);
          }
        }
      } catch (err) {
        console.error("Failed to check upload limit:", err);
      } finally {
        setIsCheckingLimit(false);
      }
    }
    
    checkLimit();
    */
  }, [user]);

  // Handle file validation
  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload a PNG, JPG, or WebP image";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File size must be under 10MB";
    }
    return null;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
    
    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, [validateFile]);

  // Cleanup preview URL
  const handleRemoveFile = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [previewUrl]);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // File input handler
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Parse the image with AI using async job polling
  const handleParse = useCallback(async () => {
    if (!selectedFile) return;

    console.log("[BET UPLOAD] Starting upload...", { 
      fileName: selectedFile.name, 
      fileSize: selectedFile.size,
      userId: user?.id 
    });

    setIsParsing(true);
    setError(null);

    try {
      // Step 1: Upload image and get job_id
      const formData = new FormData();
      formData.append("image", selectedFile);

      console.log("[BET UPLOAD] Uploading to /api/bet-tickets/parse");
      const uploadResponse = await fetch("/api/bet-tickets/parse", {
        method: "POST",
        body: formData,
        headers: user?.id ? { "x-user-id": user.id.toString() } : {},
      });

      const uploadResult = await uploadResponse.json();
      
      if (!uploadResponse.ok || !uploadResult.job_id) {
        throw new Error(uploadResult.error || "Failed to upload image");
      }

      const jobId = uploadResult.job_id;
      console.log("[BET UPLOAD] Job created:", jobId);

      // Step 2: Poll for completion
      const pollInterval = 2000; // 2 seconds
      const maxAttempts = 60; // 2 minutes max
      let attempts = 0;

      const pollJob = async (): Promise<{ ticket_id: number }> => {
        attempts++;
        console.log("[BET UPLOAD] Polling job", jobId, "attempt", attempts);

        const pollResponse = await fetch(`/api/bet-tickets/jobs/${jobId}`, {
          headers: user?.id ? { "x-user-id": user.id.toString() } : {},
        });

        const pollResult = await pollResponse.json();
        console.log("[BET UPLOAD] Poll result:", pollResult);

        if (pollResult.status === "complete" && pollResult.ticket_id) {
          return { ticket_id: pollResult.ticket_id };
        }

        if (pollResult.status === "error") {
          throw new Error(pollResult.error || "Failed to parse bet slip");
        }

        if (attempts >= maxAttempts) {
          throw new Error("Parsing took too long. Please try again.");
        }

        // Still processing, wait and try again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        return pollJob();
      };

      const result = await pollJob();
      console.log("[BET UPLOAD] Parse complete, ticket:", result.ticket_id);

      // Success - navigate to review page
      navigate(`/bet/${result.ticket_id}/review`);
    } catch (err) {
      console.error("[BET UPLOAD] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsParsing(false);
    }
  }, [selectedFile, user, navigate]);

  // Handle upgrade navigation
  const handleUpgrade = useCallback(() => {
    navigate("/settings?tab=subscription");
  }, [navigate]);

  // Show loading while checking limits
  if (isCheckingLimit) {
    return (
      <div className="min-h-screen">
        <CinematicBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-slate-400">Checking upload access...</div>
        </div>
      </div>
    );
  }

  // Show limit indicator for limited tiers
  const showLimitIndicator = uploadLimit && uploadLimit.maxUploads !== null;

  return (
    <div className="min-h-screen">
      <CinematicBackground />
      
      {/* Upload Limit Modal */}
      {showLimitModal && uploadLimit && !uploadLimit.canUpload && (
        <UpgradeLimitModal
          limitInfo={uploadLimit}
          onClose={() => setShowLimitModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          {/* Usage indicator */}
          {showLimitIndicator && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/70 border border-slate-700/50">
              <div 
                className={cn(
                  "w-2 h-2 rounded-full",
                  uploadLimit.canUpload ? "bg-emerald-400" : "bg-amber-400"
                )}
              />
              <span className="text-xs text-slate-400">
                {uploadLimit.uploadsUsed}/{uploadLimit.maxUploads} uploads used
                {uploadLimit.windowHours === 24 ? " today" : " this week"}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-blue-400 mb-2">
              <Camera className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Screenshot Upload</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-100">Upload Your Bet Slip</h1>
            <p className="text-slate-400 max-w-md mx-auto">
              Take a screenshot of your bet and our AI will extract all the details automatically
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleInputChange}
            className="hidden"
          />

          {/* Upload area or preview */}
          {previewUrl && selectedFile ? (
            <ImagePreview
              imageUrl={previewUrl}
              fileName={selectedFile.name}
              onRemove={handleRemoveFile}
              isParsing={isParsing}
            />
          ) : (
            <DropZone
              isDragging={isDragging}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onFileSelect={openFileDialog}
              hasFile={false}
            />
          )}

          {/* Parse button */}
          {selectedFile && !isParsing && (
            <Button
              onClick={handleParse}
              className="w-full h-14 text-lg gap-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
            >
              <Sparkles className="w-5 h-5" />
              Parse with AI
            </Button>
          )}

          {/* Supported sportsbooks */}
          <div className="pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 text-center mb-3">
              Works with popular sportsbooks
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SPORTSBOOK_HINTS.map((book) => (
                <span
                  key={book}
                  className="px-3 py-1 text-xs text-slate-400 bg-slate-800/50 rounded-full"
                >
                  {book}
                </span>
              ))}
            </div>
          </div>

          {/* Manual entry link */}
          <div className="text-center pt-4">
            <p className="text-sm text-slate-400 mb-2">
              Prefer to enter manually?
            </p>
            <Link
              to="/bet/new"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create ticket manually
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BetUploadPage;
