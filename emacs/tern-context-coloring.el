;; -*- lexical-binding: t; -*-

(require 'context-coloring)
(require 'tern)

(defun tern-context-coloring-delay (fn)
  "Run FN in the next turn of the event loop."
  (run-with-idle-timer 0 nil fn))

(defun tern-context-coloring-apply-tokens (tokens)
  "Iterate through tokens representing start, end and level."
  (while tokens
    (context-coloring-colorize-region
     (pop tokens)
     (pop tokens)
     (pop tokens))))

(defun tern-context-coloring-read-numbers ()
  "Fast `json-read' for an array of integers."
  (let* ((braceless (buffer-substring-no-properties
                     (1+ (point-min))
                     (1- (point-max))))
         (numbers (mapcar #'string-to-number
                          (split-string braceless ","))))
    numbers))

(defun tern-context-coloring-do-colorize (data)
  "Use DATA to colorize the buffer."
  (context-coloring-before-colorize)
  (let* ((file (cdr (assq 'file data)))
         (tokens (cond
                  (file
                   (with-temp-buffer
                     (insert-file-contents file)
                     (tern-context-coloring-read-numbers)))
                  (t
                   data))))
    (with-silent-modifications
      (tern-context-coloring-apply-tokens tokens)
      (context-coloring-colorize-comments-and-strings))))

(defun tern-context-coloring-colorize ()
  "Query tern for contextual colors and colorize the buffer."
  (interactive)
  ;; Clear the stack to run `post-command-hook' so Tern won't erroneously
  ;; consider the query stale immediately after enabling a mode.
  (tern-context-coloring-delay
   (lambda ()
     (tern-run-query
      #'tern-context-coloring-do-colorize
      "context-coloring"
      (point)
      :full-file))))

(context-coloring-define-dispatch
 'tern
 :modes '(js-mode js-jsx-mode)
 :colorizer #'tern-context-coloring-colorize
 :setup #'context-coloring-setup-idle-change-detection
 :teardown #'context-coloring-teardown-idle-change-detection)

(provide 'tern-context-coloring)