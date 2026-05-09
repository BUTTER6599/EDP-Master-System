// EDP Make Ready - new ticket form behaviors
(function () {
  function applyType() {
    var sel = document.querySelector('input[name=ticket_type]:checked');
    var t = sel ? sel.value : '';
    var nameFld = document.getElementById('cust-name-fld');
    var phoneFld = document.getElementById('cust-phone-fld');
    var nameEl = document.getElementById('customer_name');
    var phoneEl = document.getElementById('customer_phone');
    var show = (t === 'SERVICE');
    if (nameFld) nameFld.style.display = show ? 'block' : 'none';
    if (phoneFld) phoneFld.style.display = show ? 'block' : 'none';
    if (nameEl) nameEl.required = show;
    if (phoneEl) phoneEl.required = show;
  }

  function applyCategory() {
    var c = document.getElementById('category');
    if (!c) return;
    var v = c.value || '';
    var show = (v === 'Dryer' || v === 'Stackable Washer Dryer' || v === 'Stove');
    var fld = document.getElementById('fuel-fld');
    if (fld) fld.style.display = show ? 'block' : 'none';
  }

  function markRadioTiles() {
    document.querySelectorAll('input[type=radio]').forEach(function (r) {
      r.addEventListener('change', function () {
        var name = r.name;
        document.querySelectorAll('input[name="' + name + '"]').forEach(function (x) {
          var lbl = x.closest('.rad-tile');
          if (lbl) {
            if (x.checked) lbl.classList.add('sel');
            else lbl.classList.remove('sel');
          }
        });
      });
    });
  }

  function wirePhotoPreviews() {
    document.querySelectorAll('.photo-slot').forEach(function (slot) {
      var thumb = slot.querySelector('.thumb');
      slot.querySelectorAll('input[type=file]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var f = this.files && this.files[0];
          if (!f) return;
          var rd = new FileReader();
          rd.onload = function (e) {
            if (thumb) {
              thumb.src = e.target.result;
              thumb.style.display = 'block';
            }
            slot.classList.add('has');
          };
          rd.readAsDataURL(f);
        });
      });
    });
  }

  function wireSubmitFeedback() {
    var form = document.getElementById('newForm');
    var btn = document.getElementById('submitBtn');
    var msg = document.getElementById('submitMsg');
    if (!form || !btn) return;
    form.addEventListener('submit', function () {
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      if (msg) msg.textContent = 'Saving photos and creating ticket...';
    });
  }

  document.querySelectorAll('input[name=ticket_type]').forEach(function (r) {
    r.addEventListener('change', applyType);
  });
  var cat = document.getElementById('category');
  if (cat) cat.addEventListener('change', applyCategory);

  markRadioTiles();
  wirePhotoPreviews();
  wireSubmitFeedback();
  applyType();
  applyCategory();
})();
