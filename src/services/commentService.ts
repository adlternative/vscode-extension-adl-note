import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import { Comment, CommentNode } from "../models/comment";

/**
 * 评论服务类，封装了所有评论相关的操作。
 */
export class CommentService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 添加一个新评论或回复到特定文件
   * @param fileUri 文件的 URI
   * @param line 评论所在的行
   * @param content 评论内容
   * @param parentCommentId 父评论 ID（可选）
   * @returns 新增的评论
   */
  public addComment(
    fileUri: vscode.Uri,
    startLine: number,
    endLine: number,
    content: string,
    author: string,
    parentCommentId?: string
  ): Comment {
    const comments = this.getComments(fileUri);
    const newComment: Comment = {
      id: uuidv4(),
      filePath: fileUri.fsPath,
      startLine,
      endLine,
      content,
      author,
      timestamp: Date.now(),
      parentCommentId: parentCommentId || null,
    };
    comments.push(newComment);
    this.updateComments(fileUri, comments);
    return newComment;
  }

  /**
   * 添加一个新回复到特定文件
   * @param fileUri 文件的 URI
   * @param startLine 评论所在的行
   * @param endLine 评论所在的行
   * @param content 评论内容
   * @param author 评论作者
   * @param parentCommentId 父评论 ID
   * @returns
   */
  public addReply(
    fileUri: vscode.Uri,
    startLine: number,
    endLine: number,
    content: string,
    author: string,
    parentCommentId: string
  ): Comment {
    return this.addComment(
      fileUri,
      startLine,
      endLine,
      content,
      author,
      parentCommentId
    );
  }

  /**
   * 获取特定文件的所有顶级评论及其回复
   * @param fileUri 文件的 URI
   * @returns 评论树数组
   */
  getCommentTree(fileUri: vscode.Uri): CommentNode[] {
    const comments = this.getComments(fileUri);
    const commentMap: { [key: string]: CommentNode } = {};

    // 初始化 CommentNode
    comments.forEach((comment) => {
      commentMap[comment.id] = { ...comment, children: [] };
    });

    const roots: CommentNode[] = [];

    // 构建树结构
    comments.forEach((comment) => {
      if (comment.parentCommentId) {
        const parent = commentMap[comment.parentCommentId];
        if (parent) {
          parent.children.push(commentMap[comment.id]);
        }
      } else {
        roots.push(commentMap[comment.id]);
      }
    });

    return roots;
  }

  /**
   * 获取特定文件的所有评论
   * @param fileUri 文件的 URI
   * @returns 评论数组
   */
  getComments(fileUri: vscode.Uri): Comment[] {
    const fileKey = this.getFileKey(fileUri);
    return this.context.workspaceState.get<Comment[]>(fileKey, []);
  }

  getCommentById(fileUri: vscode.Uri, commentId: string): Comment | undefined {
    const comments = this.getComments(fileUri);
    return comments.find((c) => c.id === commentId);
  }

  /**
   * 生成文件对应的唯一 key
   * @param uri 文件的 URI
   * @returns 唯一 key 字符串
   */
  private getFileKey(uri: vscode.Uri): string {
    return `comments:${uri.toString()}`;
  }

  /**
   * 更新特定文件中的某个评论
   * @param fileUri 文件的 URI
   * @param updatedComment 更新后的评论对象
   * @returns 是否更新成功
   */
  public updateComment(fileUri: vscode.Uri, updatedComment: Comment): boolean {
    const comments = this.getComments(fileUri);
    const index = comments.findIndex((c) => c.id === updatedComment.id);
    if (index === -1) {
      return false;
    }
    comments[index] = updatedComment;
    this.updateComments(fileUri, comments);
    return true;
  }

  /**
   * 更新 workspaceState 中的评论数据
   * @param fileUri 文件的 URI
   * @param comments 更新后的评论数组
   */
  private updateComments(
    fileUri: vscode.Uri,
    comments: Comment[]
  ): Thenable<void> {
    const fileKey = this.getFileKey(fileUri);
    return this.context.workspaceState.update(fileKey, comments);
  }

  /**
   * 删除特定文件中的某个评论及其所有子评论
   * @param fileUri 文件的 URI
   * @param commentId 要删除的评论的 ID
   * @returns 是否删除成功
   */
  public deleteComment(fileUri: vscode.Uri, commentId: string): boolean {
    let comments = this.getComments(fileUri);
    const initialLength = comments.length;

    // 删除目标评论
    comments = comments.filter((c) => c.id !== commentId);

    // 删除所有子评论（回复）
    comments = comments.filter((c) => c.parentCommentId !== commentId);

    if (comments.length === initialLength) {
      return false;
    }

    this.updateComments(fileUri, comments);
    return true;
  }
}
