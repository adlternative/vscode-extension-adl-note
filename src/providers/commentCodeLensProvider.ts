import * as vscode from "vscode";
import { CommentService } from "../services/commentService";
import simpleGit, { SimpleGit } from "simple-git";
import parseDiff from "parse-diff"; // 导入 parse-diff
import {
  CommentLocationHelperService,
  CommentLocationDTO,
} from "../services/commentLocationService";
function truncateString(str: string, maxChars: number = 3): string {
  const chars = [...str];
  if (chars.length > maxChars) {
    return chars.slice(0, maxChars).join("") + "...";
  }
  return str;
}

export class CommentCodeLensProvider implements vscode.CodeLensProvider {
  private commentService: CommentService;
  private commentLocationHelperService: CommentLocationHelperService;
  private onDidChange: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this.onDidChange.event;

  constructor(commentService: CommentService) {
    this.commentService = commentService;
    this.commentLocationHelperService = new CommentLocationHelperService();

    // 监听编辑器的选区变化，触发 CodeLens 刷新
    vscode.window.onDidChangeTextEditorSelection(() => {
      this.refresh();
    });
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];
    const comments = this.commentService.getCommentTree(document.uri);

    // 获取工作区文件夹
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("The file is not in a workspace");
      return [];
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    const git: SimpleGit = simpleGit(workspacePath);
    // 使用 git hash-objects -w 获取当前 blob 的哈希值 fileHash
    const fileHash = await git.hashObject(document.uri.fsPath, true, undefined);

    // 添加现有评论的 CodeLens
    for (const comment of comments) {
      if (comment.parentCommentId !== null) {
        continue;
      }
      const commentCount = comment.children.length + 1;
      let startPosition;
      let endPosition;
      if (comment.blobHash === null || comment.blobHash === undefined) {
        startPosition = new vscode.Position(comment.startLine - 1, 0);
        endPosition = new vscode.Position(
          comment.endLine - 1,
          document.lineAt(comment.endLine - 1).text.length
        );
      } else {
        // 评论定位
        // 使用当前文件和评论的 blob 进行 diff
        // 通过 diff 结果计算出评论的位置
        try {
          // 使用 git diff <comment.blobHash> <fileHash> 获取 diff 结果
          const diffOutput = await git.diff([
            "--unified=0",
            comment.blobHash,
            fileHash,
          ]);

          // 使用 parse-diff 解析 diff 结果
          const diffFiles = parseDiff(diffOutput);
          if (diffFiles.length > 1) {
            vscode.window.showErrorMessage("Diff output is invalid");
            continue;
          } else if (diffFiles.length === 0) {
            startPosition = new vscode.Position(comment.startLine - 1, 0);
            endPosition = new vscode.Position(
              comment.endLine - 1,
              document.lineAt(comment.endLine - 1).text.length
            );
          } else {
            const diffFile = diffFiles[0];

            // 计算出评论的位置
            let sideLine = this.commentLocationHelperService.calculateSideLine(
              comment.startLine,
              comment.endLine,
              diffFile.chunks
            );
            if (sideLine.fromLineNumber < 1) {
              sideLine.fromLineNumber = 1;
            }
            if (sideLine.toLineNumber < 1) {
              sideLine.toLineNumber = 1;
            }

            if (sideLine.fromLineNumber > document.lineCount) {
              sideLine.fromLineNumber = document.lineCount;
            }
            if (sideLine.toLineNumber > document.lineCount) {
              sideLine.toLineNumber = document.lineCount;
            }

            startPosition = new vscode.Position(sideLine.fromLineNumber - 1, 0);
            endPosition = new vscode.Position(
              sideLine.toLineNumber - 1,
              document.lineAt(sideLine.toLineNumber - 1).text.length
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            "Failed to calculate comment location"
          );
          startPosition = new vscode.Position(comment.startLine - 1, 0);
          endPosition = new vscode.Position(
            comment.endLine - 1,
            document.lineAt(comment.endLine - 1).text.length
          );
        }
      }

      const range = new vscode.Range(startPosition, endPosition);

      const codeLens = new vscode.CodeLens(range, {
        title: `💬 (${commentCount}) ${truncateString(comment.content, 10)}`,
        command: "extension.navigateToComment",
        arguments: [comment],
      });

      lenses.push(codeLens);
    }

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
