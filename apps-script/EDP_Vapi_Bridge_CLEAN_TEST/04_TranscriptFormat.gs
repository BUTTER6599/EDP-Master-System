// ============================================================
// EXTRACT USER-ONLY SPEECH
// ============================================================

function extractUserText_(
  transcript
) {

  const lines =
    String(
      transcript ||
      ''
    )
      .split(/\r?\n/);

  const userLines = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i].trim();

    if (
      /^user\s*:/i.test(line) ||
      /^customer\s*:/i.test(line)
    ) {

      userLines.push(
        line.replace(
          /^(user|customer)\s*:\s*/i,
          ''
        )
      );
    }
  }

  // Fallback if transcript formatting changes.
  if (!userLines.length) {
    return String(
      transcript ||
      ''
    );
  }

  return userLines.join(' ');
}


// ============================================================
// PREVIEW
// ============================================================

function makePreview_(
  text,
  maxLength
) {

  const cleaned =
    String(
      text ||
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  if (
    cleaned.length <=
    maxLength
  ) {

    return cleaned;
  }


  return (
    cleaned.substring(
      0,
      maxLength - 3
    ) +
    '...'
  );
}
