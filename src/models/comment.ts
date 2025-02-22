// src/models/comment.ts
export interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  author: string; // Mock 值
  timestamp: number;
  parentCommentId: string | null;
  // blobHash: string; // Git blob 快照
}

export interface CommentNode extends Comment {
  children: CommentNode[];
}
