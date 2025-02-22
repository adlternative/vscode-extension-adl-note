// media/sidebar.js
(function () {
  const vscode = acquireVsCodeApi();
  const commentsDiv = document.getElementById("comments");
  let currentHighlightedId = null;

  // 监听来自 VSCode 扩展的消息
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.command) {
      case "refresh":
        renderComments(message.comments);
        break;
      case "selectComment":
        highlightAndScrollToComment(message.commentId);
        break;
    }
  });

  // 发送 'ready' 消息给扩展，表示 Webview 已加载完成
  window.onload = () => {
    vscode.postMessage({ command: "ready" });
  };

  function renderComments(comments) {
    commentsDiv.innerHTML = "";
    if (comments.length === 0) {
      commentsDiv.innerHTML = "<p>No comments for this file.</p>";
      return;
    }

    comments.forEach((comment) => {
      const commentElem = createCommentElement(comment);
      commentsDiv.appendChild(commentElem);
    });

    // 添加导航点击事件监听器（点击评论内容或标题）
    document
      .querySelectorAll(".comment-header, .comment-content")
      .forEach((element) => {
        element.style.cursor = "pointer";
        element.addEventListener("click", () => {
          const commentId = element.getAttribute("data-id");
          if (commentId) {
            vscode.postMessage({ command: "navigate", commentId });
          }
        });
      });

    // 添加回复按钮的事件监听器
    document.querySelectorAll(".submit-reply-button").forEach((button) => {
      button.addEventListener("click", () => {
        const commentId = button.getAttribute("data-id");
        const textarea = document.getElementById(`reply-textarea-${commentId}`);
        const replyContent = textarea.value.trim();
        if (replyContent) {
          vscode.postMessage({ command: "reply", commentId, replyContent });
          textarea.value = "";
        } else {
          // 发送警告消息给扩展，由扩展处理显示
          vscode.postMessage({
            command: "showWarning",
            message: "Reply Message should not be empty.",
          });
        }
      });
    });

    // 添加折叠/展开回复的事件监听器
    document.querySelectorAll(".toggle-replies").forEach((button) => {
      button.addEventListener("click", () => {
        const commentId = button.getAttribute("data-id");
        const repliesDiv = document.querySelector(
          `.replies[data-parent-id="${commentId}"]`
        );
        if (!repliesDiv) return;

        if (repliesDiv.classList.contains("show")) {
          repliesDiv.classList.remove("show");
          button.textContent = `Show Reply (${getReplyCount(commentId)})`;
        } else {
          repliesDiv.classList.add("show");
          button.textContent = `Hidden Reply (${getReplyCount(commentId)})`;
        }
      });
    });
  }

  function createCommentElement(comment) {
    const commentElem = document.createElement("div");
    commentElem.className = "comment";
    commentElem.setAttribute("data-id", comment.id);

    // 获取回复数量
    const replyCount = comment.children ? comment.children.length : 0;

    // 添加评论内容
    commentElem.innerHTML = `
      <div class="comment-header" data-id="${comment.id}">
        <span class="avatar">${escapeHtml(comment.author)
          .charAt(0)
          .toUpperCase()}</span>
        <div class="header-info">
          <strong>${escapeHtml(comment.author)}</strong> 
          <span class="comment-lines">on lines ${comment.startLine}-${
      comment.endLine
    }</span>
          <span class="comment-timestamp">${formatTimestamp(
            comment.timestamp
          )}</span>
        </div>
      </div>
      <div class="comment-content" data-id="${comment.id}">
        ${escapeHtml(comment.content).replace(/\n/g, "<br>")}
      </div>
      <div class="action-section">
        <button data-id="${
          comment.id
        }" class="toggle-replies">Show Reply (${replyCount})</button>
      </div>
      <div class="reply-section">
        <textarea id="reply-textarea-${
          comment.id
        }" rows="3" placeholder="Enter your reply"></textarea>
        <button data-id="${
          comment.id
        }" class="submit-reply-button">Reply</button>
      </div>
      <div class="replies" data-parent-id="${comment.id}">
        ${renderReplies(comment.children || [])}
      </div>
    `;
    return commentElem;
  }

  function renderReplies(replies) {
    if (replies.length === 0) {
      return "<p class='no-replies'>No Reply</p>";
    }

    return replies
      .map(
        (reply) => `
        <div class="reply">
          <span class="avatar">${escapeHtml(reply.author)
            .charAt(0)
            .toUpperCase()}</span>
          <div class="reply-info">
            <strong>${escapeHtml(reply.author)}</strong> 
            <span class="comment-timestamp">${formatTimestamp(
              reply.timestamp
            )}</span>
            <p>${escapeHtml(reply.content).replace(/\n/g, "<br>")}</p>
          </div>
        </div>
      `
      )
      .join("");
  }

  /**
   * 获取指定评论的回复数量
   * @param {string} commentId 评论的 ID
   * @returns {number} 回复数量
   */
  function getReplyCount(commentId) {
    const commentElem = document.querySelector(
      `.comment[data-id="${commentId}"]`
    );
    if (!commentElem) return 0;
    const repliesDiv = commentElem.querySelector(
      `.replies[data-parent-id="${commentId}"]`
    );
    if (!repliesDiv) return 0;
    const replyElements = repliesDiv.querySelectorAll(".reply");
    return replyElements.length;
  }

  /**
   * 高亮并滚动到指定的评论
   * @param {string} commentId 评论的 ID
   */
  function highlightAndScrollToComment(commentId) {
    if (currentHighlightedId) {
      const prevElem = document.querySelector(
        `.comment[data-id="${currentHighlightedId}"]`
      );
      if (prevElem) {
        prevElem.classList.remove("highlight");
      }
    }

    const targetElem = document.querySelector(
      `.comment[data-id="${commentId}"]`
    );
    if (targetElem) {
      targetElem.classList.add("highlight");
      targetElem.scrollIntoView({ behavior: "smooth", block: "center" });
      currentHighlightedId = commentId;

      // 移除高亮 after a delay (e.g., 3 seconds)
      setTimeout(() => {
        targetElem.classList.remove("highlight");
        currentHighlightedId = null;
      }, 3000);
    }
  }

  // 格式化时间戳
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  // 简单的 HTML 转义，防止 XSS
  function escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, function (m) {
      return map[m];
    });
  }
})();
