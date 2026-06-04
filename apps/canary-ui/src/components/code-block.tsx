"use client";

import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

// Syntax-highlighted, copyable code. Session step scripts run in a QuickJS
// sandbox, so they're JavaScript/TypeScript by default.
export function CodeBlock({
  code,
  language = "typescript",
}: {
  code: string;
  language?: string;
}) {
  return (
    <div className="group relative">
      <CopyButton
        className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
        text={code}
        title="Copy script"
      />
      <Highlight
        code={code.replace(/\n$/, "")}
        language={language}
        theme={themes.github}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              className,
              "overflow-auto rounded-lg border border-border p-3.5 font-mono text-xs leading-relaxed"
            )}
            style={style}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
