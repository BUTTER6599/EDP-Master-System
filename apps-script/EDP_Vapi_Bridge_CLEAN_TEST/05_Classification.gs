// ============================================================
// BUSINESS CLASSIFICATION
// ============================================================

function classifyCall_(
  inputText
) {

  const t =
    String(
      inputText ||
      ''
    )
      .toLowerCase();


  let purpose =
    'ℹ️ GENERAL INFO';

  let priority =
    'NORMAL';

  let moneyOpportunity =
    'NO';

  const actions = [];


  // ----------------------------------------------------------
  // WARRANTY
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'warranty',
        'under warranty',
        'just bought',
        'just purchased',
        'bought from you',
        'purchased from you',
        'got it from you'
      ]
    )
  ) {

    purpose =
      '🛡️ WARRANTY';

    priority =
      'HIGH';
  }


  // ----------------------------------------------------------
  // REPAIR
  // ----------------------------------------------------------

  if (
    purpose !==
      '🛡️ WARRANTY' &&
    containsAny_(
      t,
      [
        'repair',
        'fix',
        'broken',
        'not working',
        "won't work",
        "doesn't work",
        'no heat',
        'not heating',
        'not cooling',
        'not spinning',
        'not draining',
        'leaking',
        'diagnostic'
      ]
    )
  ) {

    purpose =
      '🔧 REPAIR';

    moneyOpportunity =
      'YES';
  }


  // ----------------------------------------------------------
  // PARTS
  // ----------------------------------------------------------

  if (
    purpose !==
      '🛡️ WARRANTY' &&
    containsAny_(
      t,
      [
        'part',
        'parts',
        'belt',
        'element',
        'thermostat',
        'knob',
        'hose',
        'cord',
        'plug'
      ]
    )
  ) {

    purpose =
      '🧩 PARTS';

    moneyOpportunity =
      'YES';
  }


  // ----------------------------------------------------------
  // SELL / TRADE / RECYCLE
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'trade in',
        'trade-in',
        'trade my',
        'sell you',
        'sell my',
        'buy my',
        'pick up my',
        'recycle',
        'haul away'
      ]
    )
  ) {

    purpose =
      '♻️ SELL / TRADE / RECYCLE';
  }


  // ----------------------------------------------------------
  // SALES LEAD
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'looking to buy',
        'looking for a',
        'looking for an',
        'want to buy',
        'need to buy',
        'do you have',
        'do yall have',
        "do y'all have",
        'how much is',
        'how much are',
        'price on',
        'what do you have',
        'in stock',
        'available',
        'buy a washer',
        'buy a dryer',
        'buy a refrigerator',
        'buy a fridge',
        'buy a stove'
      ]
    )
  ) {

    purpose =
      '💰💵 SALES LEAD';

    moneyOpportunity =
      'YES';

    priority =
      'HIGH';
  }


  // ----------------------------------------------------------
  // APPOINTMENT / STORE VISIT
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'appointment',
        'schedule',
        'scheduled',
        'come by',
        'coming by',
        'stop by',
        'stopping by',
        'come in',
        'coming in',
        'visit the store',
        'see it in person',
        'look at it',
        'look at the'
      ]
    )
  ) {

    actions.push(
      '📅 APPOINTMENT / STORE VISIT'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // CALLBACK
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'call me back',
        'call back',
        'callback',
        'give me a call'
      ]
    )
  ) {

    actions.push(
      '📞 CALLBACK NEEDED'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // TEXT BACK
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'text me',
        'send me a text',
        'text me back'
      ]
    )
  ) {

    actions.push(
      '💬 TEXT BACK'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // URGENT / OWNER ESCALATION
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'emergency',
        'fire',
        'gas leak',
        'injured',
        'injury',
        'police',
        'lawyer',
        'attorney',
        'lawsuit',
        'fraud',
        'chargeback',
        'threat',
        'threaten',
        'speak to the owner',
        'talk to the owner',
        'speak to a manager',
        'talk to a manager',
        'serious complaint'
      ]
    )
  ) {

    actions.push(
      '⚠️ MANAGER / ESCALATION'
    );

    priority =
      'URGENT';
  }


  // Warranty = existing obligation, not new-money flag.
  if (
    purpose ===
    '🛡️ WARRANTY'
  ) {

    moneyOpportunity =
      'NO';
  }


  const action =
    actions.length
      ? actions.join(' | ')
      : 'NONE';


  return {
    purpose:
      purpose,

    action:
      action,

    priority:
      priority,

    moneyOpportunity:
      moneyOpportunity
  };
}


// ============================================================
// PHRASE MATCHER
// ============================================================

function containsAny_(
  text,
  phrases
) {

  for (
    let i = 0;
    i < phrases.length;
    i++
  ) {

    if (
      text.indexOf(
        phrases[i]
      ) !== -1
    ) {

      return true;
    }
  }

  return false;
}
