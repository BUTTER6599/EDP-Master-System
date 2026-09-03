// EDP Vapi Bridge - 05_QuestionLearning_Tests (split from Code.js b5a4038, move-only refactor)

// ============================================================
// QUESTION LEARNING
// ============================================================
// This route must never claim a question was logged/saved/recorded/
// submitted unless sheet.appendRow() below actually completed successfully.
// QUESTION_LOG_FAILURE_MESSAGE_ is generic on purpose - it must never expose
// which property was missing, any spreadsheet ID or tab name, or exception
// details.
var QUESTION_LOG_FAILURE_MESSAGE_ = 'I couldn\'t log that question right now.';

function handleUnansweredQuestion(args, msg) {
  try {
    var category = (args.category || 'receptionist').toString().toLowerCase();
    var question = (args.question || '').toString();
    var customerName = (args.customer_name || 'Unknown').toString();
    var customerPhone = (args.customer_phone || '').toString();
    var callId = (args.call_id || (msg && msg.call && msg.call.id) || '').toString();
    var timestamp = new Date();

    if (!question) {
      return 'No question provided.';
    }

    // No hardcoded tab literal here or elsewhere - the tech vs. receptionist
    // question tab is always read from its own TEST Script Property, never a
    // default/active sheet or a fallback literal.
    var tabProperty = (category === 'tech') ? 'VAPI_TEST_TECH_QUESTIONS_TAB' : 'VAPI_TEST_RECEPTIONIST_QUESTIONS_TAB';
    var spreadsheetId = getTrimmedProperty_('VAPI_TEST_SPREADSHEET_ID');
    var tabName = getTrimmedProperty_(tabProperty);
    if (!spreadsheetId || !tabName) {
      Logger.log('handleUnansweredQuestion: TEST question-tab configuration incomplete');
      return QUESTION_LOG_FAILURE_MESSAGE_;
    }
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow([
        'Timestamp', 'Question', 'Normalized Question', 'Category',
        'Customer Name', 'Customer Phone', 'Call ID', 'Times Asked', 'Status', 'Answer'
      ]);
      sheet.getRange('A1:J1').setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    var normalized = normalizeQuestion(question);
    var count = countMatchingQuestions(sheet, normalized) + 1;

    sheet.appendRow([
      timestamp, question, normalized, category,
      customerName, customerPhone, callId, count, 'NEW', ''
    ]);

    // The row is now durably persisted. A later Pushover failure must never
    // retry this append, create a duplicate row, or cause this route to
    // falsely report that logging failed - only the notification failed.
    if (count >= 2) {
      try {
        fireQuestionAlertPushover(question, count, category);
      } catch (alertErr) {
        Logger.log('handleUnansweredQuestion: question alert failed after a successful log: ' + alertErr.toString());
      }
    }

    return 'Logged. I\'ll get an answer and follow up.';
  } catch (err) {
    Logger.log('handleUnansweredQuestion error: ' + err.toString());
    return QUESTION_LOG_FAILURE_MESSAGE_;
  }
}

function normalizeQuestion(q) {
  return q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function countMatchingQuestions(sheet, normalized) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 3, lastRow - 1, 1).getValues(); // column C = Normalized Question
  var count = 0;
  for (var i = 0; i < values.length; i++) {
    if ((values[i][0] || '').toString() === normalized) count++;
  }
  return count;
}

function fireQuestionAlertPushover(question, count, category) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  if (!token || !user) {
    Logger.log('Pushover credentials missing for question alert');
    return;
  }
  var title = 'New Question to Answer (asked ' + count + 'x)';
  var message = 'Category: ' + category + '\n' +
                'Question: ' + question + '\n\n' +
                'Add an answer to the knowledge base so Lo/Brian can handle this next time.';
  UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
    method: 'post',
    payload: { token: token, user: user, title: title, message: message },
    muteHttpExceptions: true
  });
}

function testPushover() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  Logger.log('App Token starts with: ' + (token ? token.substring(0, 6) + '...' : 'MISSING'));
  Logger.log('User Key starts with: ' + (user ? user.substring(0, 6) + '...' : 'MISSING'));
  if (!token || !user) {
    Logger.log('ERROR: Credentials missing in Script Properties');
    return;
  }
  try {
    var response = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method: 'post',
      payload: {
        token: token,
        user: user,
        title: 'TEST - EDP Bridge',
        message: 'If you see this, Pushover works. Time: ' + new Date().toLocaleString()
      },
      muteHttpExceptions: true
    });
    Logger.log('Pushover HTTP code: ' + response.getResponseCode());
    Logger.log('Pushover response: ' + response.getContentText());
  } catch (err) {
    Logger.log('EXCEPTION: ' + err.toString());
  }
}

// ============================================================
// LOCAL, NON-NETWORK MANUAL TESTS
// ============================================================
// Run from the Apps Script editor. Never sends a real Pushover message,
// never makes a real Vapi API request, never writes to Drive or
// VAPI_CALL_LOG - determineIntakeType() and the extract*_ helpers are pure
// text-processing functions with no external calls.
function testClassification() {
  var cases = [
    {
      label: 'appliance buyer',
      status: 'customer-ended-call',
      summary: 'Customer wants to buy a new washer, asked about price and delivery.',
      transcript: 'Hi, I am looking for a new washer, how much does the Whirlpool one cost and can you deliver it?',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'parts customer',
      status: 'customer-ended-call',
      summary: 'Customer needs a control board for their dryer.',
      transcript: 'I need a part, specifically a control board for my dryer, do you have it in stock?',
      expectedCategory: 'PARTS'
    },
    {
      label: 'appliance seller',
      status: 'customer-ended-call',
      summary: 'Customer wants to sell their old refrigerator.',
      transcript: 'I want to sell my refrigerator, what is your asking price for a trade-in?',
      expectedCategory: 'SELL_TRADE_IN'
    },
    {
      label: 'warranty customer',
      status: 'customer-ended-call',
      summary: 'Customer bought a stove recently and it stopped working, wants warranty exchange.',
      transcript: 'I just purchased a stove and it stopped working, is this covered under warranty?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'repair customer',
      status: 'customer-ended-call',
      summary: 'Customer needs their dryer repaired, it is not working.',
      transcript: 'My dryer is broken and not working, can I schedule a repair or diagnostic?',
      expectedCategory: 'REPAIR_SERVICE'
    },
    {
      label: 'human-only request',
      status: 'customer-ended-call',
      summary: 'Caller just wants to speak to Taylor.',
      transcript: 'Can I speak to Taylor or a manager please, I need a real person.',
      expectedCategory: 'HUMAN_REQUEST',
      expectedNeedsHuman: true
    },
    {
      label: 'warranty plus human request',
      status: 'customer-ended-call',
      summary: 'Customer has a warranty issue and wants to speak to a manager.',
      transcript: 'My fridge is under warranty and stopped working, I would like to speak to a manager about it.',
      expectedCategory: 'WARRANTY',
      expectedNeedsHuman: true
    },
    {
      label: 'spam robocall',
      status: 'customer-ended-call',
      summary: 'Automated call about Google Business listing verification.',
      transcript: 'This call is regarding your Google listing, please verify your business to improve your search ranking.',
      expectedCategory: 'SPAM',
      expectedNeedsHuman: false
    },
    {
      label: 'actual Vapi system error',
      status: 'call.in-progress.error-providerfault-openai-llm-failed',
      summary: '',
      transcript: '',
      expectedCategory: 'SYSTEM_ERROR'
    },
    {
      label: 'short legitimate customer call',
      status: 'customer-ended-call',
      summary: 'Quick call, customer asked about store hours.',
      transcript: 'What time do you close today?',
      expectedCategory: 'GENERAL',
      expectedNeedsHuman: false
    },
    {
      label: 'washer customer asking about extended warranty (Blocker 4 regression)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Do you sell washers, and do you offer an extended warranty on them?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'refrigerator customer asking whether a warranty is offered (Blocker 4 regression)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'If I buy a refrigerator from you, is there a warranty offered on it?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'vehicle-warranty robocall (spam must still be caught)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'This call is about your vehicle warranty, your extended car warranty is about to expire.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'final notice press one robocall (spam must still be caught)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'This is your final notice, press one to speak with a representative.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'legitimate appliance customer using the word offer',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'What is your best offer on a used dryer today?',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'legitimate customer asking for a manager (not spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'My dryer is broken, can I speak to a manager about getting it repaired?',
      expectedNotCategory: 'SPAM'
    },
    {
      label: 'legitimate caller asking about a sale (not spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Is there a sale on refrigerators this week? I am looking to buy one.',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'unrelated merchant-services solicitation (spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'We can offer your business better merchant services processing rates on your credit card transactions.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'sell my old dryer (regression fix)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'I want to sell my old dryer.',
      expectedCategory: 'SELL_TRADE_IN'
    },
    {
      label: 'sales wording then buy intent (regression fix)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Are you having any sales on washers right now? I want to buy one.',
      expectedCategory: 'APPLIANCE_SALES'
    }
  ];

  var results = [];
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var classification = determineIntakeType(c.status, c.summary, c.transcript);
    var pass = true;
    if (c.expectedCategory !== undefined) {
      pass = pass && (classification.category === c.expectedCategory);
    }
    if (c.expectedNotCategory !== undefined) {
      pass = pass && (classification.category !== c.expectedNotCategory);
    }
    if (c.expectedNeedsHuman !== undefined) {
      pass = pass && (classification.needsHuman === c.expectedNeedsHuman);
    }
    results.push({
      label: c.label,
      expectedCategory: c.expectedCategory,
      actualCategory: classification.category,
      needsHuman: classification.needsHuman,
      pass: pass
    });
  }

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
