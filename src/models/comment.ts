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

  commitHash: string | null; // Git commit 哈希
  blobHash: string | null; // Git blob 哈希
}

export interface CommentNode extends Comment {
  children: CommentNode[];
}
