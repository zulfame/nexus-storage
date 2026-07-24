import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Presentation,
  File as FileIcon,
} from "lucide-react";

const MAP = {
  // images
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", svg: "image", ico: "image", heic: "image", avif: "image",
  // pdf
  pdf: "pdf",
  // word
  doc: "word", docx: "word", odt: "word", rtf: "word",
  // spreadsheet
  xls: "sheet", xlsx: "sheet", csv: "sheet", ods: "sheet", tsv: "sheet",
  // presentation
  ppt: "slide", pptx: "slide", odp: "slide",
  // video
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video", wmv: "video", flv: "video", m4v: "video",
  // audio
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", aac: "audio", m4a: "audio",
  // archive
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", bz2: "archive",
  // code / text
  txt: "text", md: "text", log: "text", json: "code", xml: "code", yml: "code", yaml: "code",
  js: "code", jsx: "code", ts: "code", tsx: "code", py: "code", java: "code", c: "code", cpp: "code",
  html: "code", css: "code", scss: "code", sh: "code", sql: "code", php: "code", go: "code", rb: "code", env: "code", ini: "code", conf: "code",
};

const META = {
  image: { icon: FileImage, color: "#0ea5e9", box: "bg-sky-50 text-sky-600" },
  pdf: { icon: FileText, color: "#dc2626", box: "bg-red-50 text-red-600" },
  word: { icon: FileText, color: "#2563eb", box: "bg-blue-50 text-blue-600" },
  sheet: { icon: FileSpreadsheet, color: "#16a34a", box: "bg-green-50 text-green-600" },
  slide: { icon: Presentation, color: "#ea580c", box: "bg-orange-50 text-orange-600" },
  video: { icon: FileVideo, color: "#7c3aed", box: "bg-violet-50 text-violet-600" },
  audio: { icon: FileAudio, color: "#db2777", box: "bg-pink-50 text-pink-600" },
  archive: { icon: FileArchive, color: "#ca8a04", box: "bg-amber-50 text-amber-600" },
  text: { icon: FileText, color: "#64748b", box: "bg-slate-50 text-slate-600" },
  code: { icon: FileCode, color: "#0891b2", box: "bg-cyan-50 text-cyan-600" },
  other: { icon: FileIcon, color: "#94a3b8", box: "bg-gray-100 text-gray-500" },
};

export function extOf(name = "") {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function categoryOf(name = "") {
  return MAP[extOf(name)] || "other";
}

export function fileMeta(name = "") {
  const cat = categoryOf(name);
  return { category: cat, ...META[cat] };
}

export function isPreviewable(name = "") {
  const cat = categoryOf(name);
  return ["image", "pdf", "word", "sheet", "video", "audio", "text", "code"].includes(cat);
}
