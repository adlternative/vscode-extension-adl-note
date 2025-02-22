import * as vscode from "vscode";
import { CommentService } from "../services/commentService";
import { Comment } from "../models/comment";

function truncateString(str: string, maxChars: number = 3): string {
  const chars = [...str];
  if (chars.length > maxChars) {
    return chars.slice(0, maxChars).join("") + "...";
  }
  return str;
}

export class CommentCodeLensProvider implements vscode.CodeLensProvider {
  private commentService: CommentService;
  private onDidChange: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this.onDidChange.event;

  constructor(commentService: CommentService) {
    this.commentService = commentService;

    // 监听编辑器的选区变化，触发 CodeLens 刷新
    vscode.window.onDidChangeTextEditorSelection(() => {
      this.refresh();
    });
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const comments = this.commentService.getCommentTree(document.uri);

    // 添加现有评论的 CodeLens
    comments.forEach((comment) => {
      if (comment.parentCommentId !== null) {
        return;
      }
      const commentCount = comment.children.length + 1;
      const startPosition = new vscode.Position(comment.startLine - 1, 0);
      const endPosition = new vscode.Position(
        comment.endLine - 1,
        document.lineAt(comment.endLine - 1).text.length
      );
      const range = new vscode.Range(startPosition, endPosition);

      const codeLens = new vscode.CodeLens(range, {
        title: `💬 (${commentCount}) ${truncateString(comment.content, 10)}`,
        command: "extension.navigateToComment",
        arguments: [comment],
      });

      lenses.push(codeLens);
    });

    // 获取当前活动编辑器和选区
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.toString() === document.uri.toString()) {
      const selection = editor.selection;

      // 确保选区非空
      const startLine = selection.start.line;
      const endLine = selection.end.line;
      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
      );

      const addCommentLens = new vscode.CodeLens(range, {
        title: `💬 Add Comment?`,
        command: "extension.addComment",
        arguments: [range],
      });
      lenses.push(addCommentLens);
    }

    return lenses;
  }

  public refresh(): void {
    this.onDidChange.fire();
  }
}
