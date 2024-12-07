interface CodeEdit {
  startLine: number;
  endLine: number;
  originalLines: string[];
  newLines: string[];
}

export class DiffParser {
  private static readonly _locationPattern = /^@@ Location: line (\d+) @@$/;

  /**
   * Parse a multi-edit diff format string into CodeEdit objects
   */
  static parseDiffFormat(diffText: string): CodeEdit[] {
    // Split the diff text into separate edit blocks
    const editBlocks = diffText
      .split('\n')
      .map((x) => x.trim())
      .join('\n')
      .trim()
      .split(/\n(?=@@)/);

    // const editBlocks = diffText.split("\n").map(x => x.trim()).join("\n").split(/\n(?=@@)/)
    const edits: CodeEdit[] = [];

    for (const block of editBlocks) {
      if (!block.trim()) {
        continue;
      }

      const lines = block.split('\n');
      const locationMatch = lines[0].match(this._locationPattern);

      if (!locationMatch) {
        continue;
      }

      const startLine = parseInt(locationMatch[1], 10);
      const originalLines: string[] = [];
      const newLines: string[] = [];

      // Parse the changes starting from line 1 (after the location header)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('-')) {
          originalLines.push(line.slice(1));
        } else if (line.startsWith('+')) {
          newLines.push(line.slice(1));
        }
      }

      edits.push({
        startLine,
        endLine: startLine,
        originalLines,
        newLines,
      });
    }

    return edits;
  }

  /**
   * Apply multiple edits to the original code
   */
  static applyEdits(originalCode: string, edits: CodeEdit[]): string {
    const lines = originalCode.split('\n');

    // Sort edits in reverse order to apply from bottom to top
    const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);

    for (const edit of sortedEdits) {
      const deleteCount = edit.originalLines.length; // If no deletions, this will be 0
      lines.splice(
        edit.startLine - 1,
        deleteCount, // Use actual number of lines being removed
        ...edit.newLines,
      );
    }

    return lines.join('\n');
  }

  /**
   * Validate that edits can be applied without conflicts
   */
  static validateEdits(edits: CodeEdit[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const sortedEdits = [...edits].sort((a, b) => a.startLine - b.startLine);

    for (let i = 0; i < sortedEdits.length - 1; i++) {
      const currentEdit = sortedEdits[i];
      const nextEdit = sortedEdits[i + 1];

      if (currentEdit.startLine + currentEdit.originalLines.length >= nextEdit.startLine) {
        errors.push(
          `Conflict between edits at lines ${currentEdit.startLine}-${currentEdit.endLine} and ${nextEdit.startLine}-${nextEdit.endLine}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
