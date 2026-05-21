// ============================================================
// auth.gs - EDP Intake
// Version: v1.0.4
// Date:    2026-05-11
// PIN verification only. No PIN values appear in source.
// api_login now returns can_edit so the client can hide privileged UI.
//
// Required Script Properties (seed via setupEDPIntakePins):
//   EDP_OWNER_PINS    JSON array of owner PIN strings
//   EDP_ADMIN_PINS    JSON array of admin / STAFF PIN strings
//   EDP_TECH_PINS     JSON array of tech PIN strings
//   EDP_PIN_NAME_MAP  JSON object mapping PIN string -> employee name
//   PIN_HASH_<pin>    Optional SHA-256 base64 hash per PIN
//
// ES5 only. ASCII only.
// ============================================================

var _EDP_PIN_CONFIG = null;

function edpLoadPinConfig() {
  if (_EDP_PIN_CONFIG) return _EDP_PIN_CONFIG;
  var props = PropertiesService.getScriptProperties();
  var ownerRaw = props.getProperty('EDP_OWNER_PINS');
  var adminRaw = props.getProperty('EDP_ADMIN_PINS');
  var techRaw  = props.getProperty('EDP_TECH_PINS');
  var nameRaw  = props.getProperty('EDP_PIN_NAME_MAP');
  if (!ownerRaw || !adminRaw || !nameRaw) {
    throw new Error('EDP PIN configuration missing. ' +
      'Run setupEDPIntakePins() from the script editor.');
  }
  _EDP_PIN_CONFIG = {
    ownerPins: JSON.parse(ownerRaw),
    adminPins: JSON.parse(adminRaw),
    techPins:  techRaw ? JSON.parse(techRaw) : [],
    nameMap:   JSON.parse(nameRaw)
  };
  return _EDP_PIN_CONFIG;
}

function edpRoleForPin(pin, cfg) {
  var p = String(pin);
  if (cfg.ownerPins.indexOf(p) >= 0) return 'OWNER';
  if (cfg.techPins.indexOf(p)  >= 0) return 'TECH';
  if (cfg.adminPins.indexOf(p) >= 0) return 'STAFF';
  return '';
}

function edpHashPin(pin) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin)
  );
  return Utilities.base64Encode(bytes);
}

function edpVerifyPin(pin) {
  if (!pin && pin !== 0) return null;
  var pinStr = String(pin).trim();
  if (!pinStr) return null;
  var cfg    = edpLoadPinConfig();
  var props  = PropertiesService.getScriptProperties();
  var hashed = edpHashPin(pinStr);

  var all = [].concat(cfg.ownerPins, cfg.adminPins, cfg.techPins);
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    var stored = props.getProperty('PIN_HASH_' + p);
    if (stored && hashed === stored) {
      return {
        pin:  p,
        role: edpRoleForPin(p, cfg),
        name: cfg.nameMap[p] || ''
      };
    }
  }
  // Dev fallback: plaintext PIN check, used only when hashes not stored.
  if (cfg.nameMap.hasOwnProperty(pinStr)) {
    return {
      pin:  pinStr,
      role: edpRoleForPin(pinStr, cfg),
      name: cfg.nameMap[pinStr]
    };
  }
  return null;
}

function api_login(pin) {
  try {
    var u = edpVerifyPin(pin);
    if (!u) return {ok: false, error: 'Invalid PIN'};
    return {
      ok:       true,
      name:     u.name,
      role:     u.role,
      pin:      u.pin,
      can_edit: edpCanEdit(u)
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}
