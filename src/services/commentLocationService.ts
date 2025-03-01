import { Chunk } from "parse-diff";

// Data Transfer Object for Comment Location
interface CommentLocationDTO {
  hunks: Chunk[]; // 使用 parseDiff.Chunk 类型
  fromLineNumber: number;
  toLineNumber: number;
}

// Class representing the index of a line within a hunk
class HunkIndexOfLine {
  isLineInHunk: boolean;
  hunkIndex: number;

  constructor(isLineInHunk: boolean, hunkIndex: number) {
    this.isLineInHunk = isLineInHunk;
    this.hunkIndex = hunkIndex;
  }
}

// Class representing the side line with updated line numbers and status
class SideLine {
  fromLineNumber: number;
  toLineNumber: number;
  isOutdated: boolean;

  constructor(
    fromLineNumber: number,
    toLineNumber: number,
    isOutdated: boolean
  ) {
    this.fromLineNumber = fromLineNumber;
    this.toLineNumber = toLineNumber;
    this.isOutdated = isOutdated;
  }
}

// 实现 CommentLocationHelperService 接口的服务类
class CommentLocationHelperService {
  /**
   * 获取指定行所在的 hunk 索引
   * @param hunks hunks 列表
   * @param line 行号
   * @returns HunkIndexOfLine 对象
   */
  private getHunkIndexOfLine(hunks: Chunk[], line: number): HunkIndexOfLine {
    let left = 0;
    let right = hunks.length - 1;

    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      const hunk = hunks[mid];

      // 使用 parse-diff 的 Chunk 属性
      if (line >= hunk.oldStart && line < hunk.oldStart + hunk.oldLines) {
        return new HunkIndexOfLine(true, mid);
      } else if (line === hunk.oldStart && hunk.oldLines === 0) {
        return new HunkIndexOfLine(false, mid - 1);
      } else if (line < hunk.oldStart) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return new HunkIndexOfLine(false, right);
  }

  /**
   * 判断是否没有之前的 hunk
   * @param index hunk 索引
   * @returns 布尔值
   */
  private noBeforeHunk(index: number): boolean {
    return index === -1;
  }

  /**
   * 获取在 hunk 内的新的起始行号
   * @param hunks hunks 列表
   * @param fromHunkIndex 起始 hunk 索引
   * @returns 新的起始行号
   */
  private getNewFromLineNumberWithinHunk(
    hunks: Chunk[],
    fromHunkIndex: number
  ): number {
    let toStart = hunks[fromHunkIndex].newStart;

    // 如果是删除代码块的场景，行数为0，则需要加1
    if (hunks[fromHunkIndex].newLines === 0) {
      toStart += 1;
    }
    return toStart;
  }

  /**
   * 获取在 hunk 内的新的结束行号
   * @param hunks hunks 列表
   * @param toHunkIndex 结束 hunk 索引
   * @returns 新的结束行号
   */
  private getNewToLineNumberWithinHunk(
    hunks: Chunk[],
    toHunkIndex: number
  ): number {
    let toEnd = hunks[toHunkIndex].newStart + hunks[toHunkIndex].newLines - 1;

    // 如果是删除代码块的场景，行数为0，则需要加1
    if (hunks[toHunkIndex].newLines === 0) {
      toEnd += 1;
    }

    return toEnd;
  }

  /**
   * 获取评论偏移后的起始行号
   * @param commentLocationDTO 评论位置 DTO
   * @param fromHunkIndexOfLine 起始 hunk 索引对象
   * @returns 新的起始行号
   */
  private getNewFromLineNumber(
    hunks: Chunk[],
    fromLineNumber: number,
    fromHunkIndexOfLine: HunkIndexOfLine
  ): number {
    const inFromHunk = fromHunkIndexOfLine.isLineInHunk;
    const fromHunkIndex = fromHunkIndexOfLine.hunkIndex;

    // 起始行之前没有 hunk，保持原行号
    if (this.noBeforeHunk(fromHunkIndex)) {
      return fromLineNumber;
    }

    // 如果起始行在 hunk 内，使用 hunk 的新的起始行号
    if (inFromHunk) {
      return this.getNewFromLineNumberWithinHunk(hunks, fromHunkIndex);
    }

    // 起始行在两个 hunk 之间，计算新的行号
    return this.getNewLineNumberOutOfHunk(hunks, fromHunkIndex, fromLineNumber);
  }

  /**
   * 获取评论偏移后的结束行号
   * @param commentLocationDTO 评论位置 DTO
   * @param toHunkIndexOfLine 结束 hunk 索引对象
   * @returns 新的结束行号
   */
  private getNewToLineNumber(
    hunks: Chunk[],
    toLineNumber: number,
    toHunkIndexOfLine: HunkIndexOfLine
  ): number {
    const inToHunk = toHunkIndexOfLine.isLineInHunk;
    const toHunkIndex = toHunkIndexOfLine.hunkIndex;

    // 结束行之前没有 hunk，保持原行号
    if (this.noBeforeHunk(toHunkIndex)) {
      return toLineNumber;
    }

    // 如果结束行在 hunk 内，使用 hunk 的新的结束行号
    if (inToHunk) {
      return this.getNewToLineNumberWithinHunk(hunks, toHunkIndex);
    }

    // 结束行在两个 hunk 之间，计算新的行号
    return this.getNewLineNumberOutOfHunk(hunks, toHunkIndex, toLineNumber);
  }

  /**
   * 计算不在 hunk 内的新的行号
   * @param hunks hunks 列表
   * @param hunkIndex 当前 hunk 索引
   * @param lineNumber 原行号
   * @returns 新的行号
   */
  private getNewLineNumberOutOfHunk(
    hunks: Chunk[],
    hunkIndex: number,
    lineNumber: number
  ): number {
    const beforeHunk = hunks[hunkIndex];
    const fromFileRangeEndLineNumber =
      beforeHunk.oldStart +
      beforeHunk.oldLines -
      1 +
      (beforeHunk.oldLines === 0 ? 1 : 0);
    const toFileRangeEndLineNumber =
      beforeHunk.newStart +
      beforeHunk.newLines -
      1 +
      (beforeHunk.newLines === 0 ? 1 : 0);

    return toFileRangeEndLineNumber - fromFileRangeEndLineNumber + lineNumber;
  }

  /**
   * 检查评论是否过期
   * @param fromHunkIndexOfLine 起始 hunk 索引对象
   * @param toHunkIndexOfLine 结束 hunk 索引对象
   * @returns 是否过期
   */
  private isOutdated(
    fromHunkIndexOfLine: HunkIndexOfLine,
    toHunkIndexOfLine: HunkIndexOfLine
  ): boolean {
    return (
      fromHunkIndexOfLine.isLineInHunk ||
      toHunkIndexOfLine.isLineInHunk ||
      fromHunkIndexOfLine.hunkIndex !== toHunkIndexOfLine.hunkIndex
    );
  }

  /**
   * 计算 SideLine 对象
   * @returns SideLine 对象
   */
  calculateSideLine(
    fromLineNumber: number,
    toLineNumber: number,
    hunks?: Chunk[]
  ): SideLine {
    console.info(
      `calculateSideLine:fromLineNumber:${fromLineNumber}, toLineNumber:${toLineNumber}`
    );

    if (!hunks || hunks.length === 0) {
      return new SideLine(fromLineNumber, toLineNumber, false);
    }

    const fromHunkIndexOfLine = this.getHunkIndexOfLine(hunks, fromLineNumber);

    const toHunkIndexOfLine = this.getHunkIndexOfLine(hunks, toLineNumber);

    return new SideLine(
      this.getNewFromLineNumber(hunks, fromLineNumber, fromHunkIndexOfLine),
      this.getNewToLineNumber(hunks, toLineNumber, toHunkIndexOfLine),
      this.isOutdated(fromHunkIndexOfLine, toHunkIndexOfLine)
    );
  }
}

export { CommentLocationDTO, CommentLocationHelperService, SideLine };
