// src/providers/commentSidebarProvider.ts
import * as vscode from "vscode";
import { CommentService } from "../services/commentService";

export class CommentSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "commentSidebar";
  private _view?: vscode.WebviewView;
  private commentService: CommentService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    commentService: CommentService
  ) {
    this.commentService = commentService;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // 监听来自 Webview 的消息
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "ready":
          this.sendComments();
          break;
        case "navigate":
          this.navigateToComment(message.commentId);
          break;
        case "reply":
          this.handleReply(message);
          break;
      }
    });

    // 监听编辑器切换以刷新 Sidebar
    vscode.window.onDidChangeActiveTextEditor(
      () => {
        this.refresh();
      },
      null,
      []
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar.css")
    );

    // CSP 配置
    const nonce = getNonce();

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <link href="${styleUri}" rel="stylesheet">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <title>Comments</title>
        </head>
        <body>
            <h2>Comments</h2>
            <div id="comments"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
  }

  private handleReply(message: any) {
    const { commentId, replyContent } = message;
    const fileUri = vscode.window.activeTextEditor?.document.uri;

    if (!fileUri) {
      // 未找到文件 URI
      vscode.window.showErrorMessage("未找到文件 URI");
      return;
    }

    const parentComment = this.commentService.getCommentById(
      fileUri,
      commentId
    );

    if (!parentComment) {
      // 未找到父评论
      vscode.window.showErrorMessage("未找到目标评论");
      return;
    }

    this.commentService.addReply(
      fileUri,
      parentComment.startLine,
      parentComment.endLine,
      replyContent,
      "MockReplyUser",
      parentComment.id
    );
    this.sendComments(); // 重新发送评论数据
  }

  public refresh() {
    if (this._view) {
      this.sendComments();
    }
  }

  private sendComments() {
    const fileUri = vscode.window.activeTextEditor?.document.uri;
    if (this._view && fileUri) {
      const comments = this.commentService.getCommentTree(fileUri);
      this._view.webview.postMessage({ command: "refresh", comments });
    }
  }

  private async navigateToComment(commentId: string) {
    const fileUri = vscode.window.activeTextEditor?.document.uri;
    if (!fileUri) {
      vscode.window.showErrorMessage("未找到文件 URI");
      return;
    }

    const targetComment = this.commentService.getCommentById(
      fileUri,
      commentId
    );

    if (!targetComment) {
      vscode.window.showErrorMessage("未找到对应的评论");
      return;
    }

    // 执行 navigateToComment 命令
    vscode.commands.executeCommand(
      "extension.navigateToComment",
      targetComment
    );
  }

  /**
   * 选中并高亮特定评论
   * @param commentId 评论的 ID
   */
  public selectComment(commentId: string) {
    if (this._view) {
      this._view.webview.postMessage({ command: "selectComment", commentId });
    }
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
