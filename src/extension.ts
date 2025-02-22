import * as vscode from "vscode";
import { CommentService } from "./services/commentService";
import { Comment } from "./models/comment";
import { CommentCodeLensProvider } from "./providers/commentCodeLensProvider";
import { CommentSidebarProvider } from "./providers/commentSidebarProvider";
import simpleGit, { SimpleGit } from "simple-git";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const commentService = new CommentService(context);

  // 创建一个全局的装饰类型用于高亮
  const commentDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 255, 0, 0.3)", // 黄色半透明背景
    border: "1px solid var(--vscode-editorWidget-border)",
  });

  // 注册添加评论命令
  const addCommentCommand = vscode.commands.registerCommand(
    "extension.addComment",
    async (range?: vscode.Range) => {
      // 接受可选的 range 参数
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Please open a text file first");
        return;
      }

      let selectedRange: vscode.Range;

      if (range instanceof vscode.Range) {
        // 通过 CodeLens 调用时使用传递的 range
        selectedRange = range;
      } else {
        // 通过命令面板或其他方式调用时使用当前选择
        const selection = editor.selection;
        if (selection.isEmpty) {
          vscode.window.showInformationMessage(
            "Please select a range to comment on."
          );
          return;
        }
        selectedRange = new vscode.Range(selection.start, selection.end);
      }

      const startLine = selectedRange.start.line + 1; // 行号从1开始
      const endLine = selectedRange.end.line + 1;
      const fileUri = editor.document.uri;
      const filePath = fileUri.fsPath;

      const commentContent = await vscode.window.showInputBox({
        prompt: "Please enter your comment",
      });
      if (!commentContent) {
        return;
      }

      // 获取工作区文件夹
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("The file is not in a workspace");
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;

      // 初始化 simple-git
      const git: SimpleGit = simpleGit(workspacePath);

      // 获取相对路径
      const relativePath = path.relative(workspacePath, filePath);

      // 获取当前 git blob hash
      let blobHash = "";
      try {
        // 确保文件已被提交
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
          vscode.window.showErrorMessage("The file is not in a git repository");
          return;
        }

        const status = await git.status([relativePath]);
        if (
          status.not_added.includes(relativePath) ||
          status.modified.includes(relativePath) ||
          status.created.includes(relativePath) ||
          status.deleted.includes(relativePath)
        ) {
          vscode.window.showErrorMessage(
            "Current file is not committed to Git"
          );
          return;
        }

        blobHash = await git.revparse([`HEAD:${relativePath}`]);
        blobHash = blobHash.trim();
      } catch (error) {
        vscode.window.showErrorMessage(
          "Cannot get blob hash, please check your git repository"
        );
        return;
      }

      commentService.addComment(
        fileUri,
        startLine,
        endLine,
        commentContent,
        "MockUser"
      );
      vscode.window.showInformationMessage("The comment has been added");

      // 刷新 CodeLens 和 Sidebar
      codeLensProvider.refresh();
      sidebarProvider.refresh();
    }
  );

  context.subscriptions.push(addCommentCommand);

  // 注册 navigateToComment 命令
  const navigateToCommentCommand = vscode.commands.registerCommand(
    "extension.navigateToComment",
    async (comment: Comment) => {
      if (!comment) {
        vscode.window.showErrorMessage("Comment not found");
        return;
      }

      // 打开对应的文件
      const fileUri = vscode.Uri.file(comment.filePath);
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
      });

      // 构建对应的范围
      const startPosition = new vscode.Position(comment.startLine - 1, 0);
      const endPosition = new vscode.Position(
        comment.endLine - 1,
        Number.MAX_VALUE
      );
      const range = new vscode.Range(startPosition, endPosition);

      // 移动光标到 startPosition 并选择范围
      editor.selection = new vscode.Selection(startPosition, endPosition);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // 应用装饰类型以高亮显示
      editor.setDecorations(commentDecorationType, [range]);

      // 移除高亮显示 after a delay (e.g., 3 seconds)
      setTimeout(() => {
        editor.setDecorations(commentDecorationType, []);
      }, 3000);

      // 执行命令以打开 Explorer 视图（包含我们的 Sidebar）
      await vscode.commands.executeCommand(
        "workbench.view.extension.commentView"
      );

      // 打开并选择 Sidebar 中的对应评论
      sidebarProvider.selectComment(comment.id);
    }
  );

  context.subscriptions.push(navigateToCommentCommand);

  // 注册 CodeLens 提供者
  const codeLensProvider = new CommentCodeLensProvider(commentService);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider("*", codeLensProvider)
  );

  // 注册 Sidebar 视图提供者
  const sidebarProvider = new CommentSidebarProvider(
    context.extensionUri,
    commentService
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommentSidebarProvider.viewType,
      sidebarProvider
    )
  );
}

export function deactivate() {}
