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


// ============================================================
// DRIVE TRANSCRIPT DISPLAY FORMAT
//
// Presentation only. Used exclusively by saveTranscript_ when
// writing the Drive artifact.
//
// Classification (extractUserText_), the TEST_CALLS preview,
// and the Pushover preview all continue to read the RAW Vapi
// transcript, so this cannot shift any classification result.
//
// Output shape:
//
//   🔵 BRIAN:
//   <assistant text>
//
//   🟢 CUSTOMER:
//   <caller text>
//
// Wording is preserved verbatim; only speaker labels and
// blank-line spacing are changed.
// ============================================================

function formatTranscriptForDisplay_(
  transcript
) {

  const raw =
    String(
      transcript ||
      ''
    );

  const lines =
    raw.split(/\r?\n/);

  // Any unlabeled text ahead of the first speaker label is
  // kept verbatim rather than dropped.
  const preamble = [];

  const turns = [];

  let current = null;


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i].trim();

    if (!line) {
      continue;
    }


    const assistantMatch =
      line.match(
        /^(ai|assistant)\s*:\s*/i
      );

    const customerMatch =
      line.match(
        /^(user|customer)\s*:\s*/i
      );


    if (assistantMatch) {

      current = {
        speaker:
          '🔵 BRIAN:',

        text: [
          line.substring(
            assistantMatch[0].length
          )
        ]
      };

      turns.push(current);

    } else if (customerMatch) {

      current = {
        speaker:
          '🟢 CUSTOMER:',

        text: [
          line.substring(
            customerMatch[0].length
          )
        ]
      };

      turns.push(current);

    } else if (current) {

      // Wrapped continuation of the current speaker turn.
      current.text.push(line);

    } else {

      preamble.push(line);
    }
  }


  // Unrecognized transcript shape — write it untouched
  // rather than risk losing wording.
  if (!turns.length) {
    return raw;
  }


  const blocks = [];

  if (preamble.length) {

    blocks.push(
      preamble.join('\n')
    );
  }


  for (
    let j = 0;
    j < turns.length;
    j++
  ) {

    const turn = turns[j];

    const body =
      turn.text
        .join('\n')
        .trim();

    blocks.push(
      turn.speaker +
      '\n' +
      body
    );
  }


  return blocks.join('\n\n');
}
