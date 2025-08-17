(function () {
  'use strict';

  function debounce(fn, delay) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null ? '' : String(text);
  }

  function unique(array) {
    return Array.from(new Set(array));
  }

  function formatWithDelimiters(number, precision, thousands, decimal) {
    if (isNaN(number) || number == null) return '0';
    number = (number / 100).toFixed(precision);
    const parts = number.split('.');
    const dollars = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${thousands}`);
    const cents = parts[1] ? decimal + parts[1] : '';
    return dollars + cents;
  }

  function formatMoney(cents, moneyFormat) {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    let value = '';
    const format = moneyFormat || '${{amount}}';
    const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    function formatValue(match) {
      switch (match) {
        case 'amount':
          return formatWithDelimiters(cents, 2, ',', '.');
        case 'amount_no_decimals':
          return formatWithDelimiters(cents, 0, ',', '.');
        case 'amount_with_comma_separator':
          return formatWithDelimiters(cents, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return formatWithDelimiters(cents, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return formatWithDelimiters(cents, 2, "'", '.');
        case 'amount_no_decimals_with_space_separator':
          return formatWithDelimiters(cents, 0, ' ', ',');
        case 'amount_with_space_separator':
          return formatWithDelimiters(cents, 2, ' ', ',');
        default:
          return formatWithDelimiters(cents, 2, ',', '.');
      }
    }
    value = format.replace(placeholderRegex, (_m, key) => formatValue(key));
    return value;
  }

  function initSection(root) {
    const dataEl = root.querySelector('[data-x-event-product]');
    if (!dataEl) return;
    let payload = null;
    try {
      payload = JSON.parse(dataEl.textContent || '{}');
    } catch (e) {
      console.error('x-event: JSON parse error', e);
      return;
    }

    const moneyFormat = payload.money_format || '${{amount}}';
    const variants = Array.isArray(payload.variants) ? payload.variants : [];
    const availableVariants = variants.filter(v => v && v.available);
    const options = Array.isArray(payload.options_with_values) ? payload.options_with_values : [];
    const numOptions = Math.max(0, Math.min(3, options.length));

    const priceEl = root.querySelector('.x-event__price');
    const errorEl = root.querySelector('.x-event__errors');
    const selects = [
      root.querySelector('.x-event__select[data-option-index="0"]'),
      root.querySelector('.x-event__select[data-option-index="1"]'),
      root.querySelector('.x-event__select[data-option-index="2"]')
    ];
    const wrappers = [
      root.querySelector('[data-option-wrapper="0"]'),
      root.querySelector('[data-option-wrapper="1"]'),
      root.querySelector('[data-option-wrapper="2"]')
    ];
    const form = root.querySelector('.x-event__form');
    const formToggle = root.querySelector('.x-event__form-toggle');
    const desc = root.querySelector('.x-event__description');
    const descToggle = root.querySelector('.x-event__desc-toggle');
    const checkoutBtn = root.querySelector('.x-event__checkout');

    const state = {
      options: options,
      variants: variants,
      availableVariants: availableVariants,
      selected: [null, null, null],
      matchedVariant: null
    };
    let hasTriedSubmit = false;

    for (let i = 0; i < 3; i++) {
      if (!wrappers[i]) continue;
      wrappers[i].setAttribute('data-hidden', i < numOptions ? 'false' : 'true');
    }

    function getAllowedValuesAtIndex(index) {
      let pool = state.availableVariants;
      for (let i = 0; i < index; i++) {
        const val = state.selected[i];
        if (val) {
          pool = pool.filter(v => (v.options && v.options[i] === val));
        }
      }
      const values = pool.map(v => v && v.options ? v.options[index] : null).filter(Boolean);
      return unique(values);
    }

    function populateSelect(index) {
      const select = selects[index];
      if (!select) return;
      while (select.firstChild) select.removeChild(select.firstChild);
      const allowed = getAllowedValuesAtIndex(index);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      setText(placeholder, 'Оберіть');
      select.appendChild(placeholder);
      allowed.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        setText(opt, val);
        select.appendChild(opt);
      });
      const current = state.selected[index];
      if (current && allowed.includes(current)) {
        select.value = current;
      } else {
        select.value = '';
        state.selected[index] = null;
      }
      
      select.setAttribute('aria-invalid', 'false');
    }

    function findMatchingVariant() {
      const optsNeeded = numOptions;
      for (let i = 0; i < optsNeeded; i++) {
        if (!state.selected[i]) return null;
      }
      const match = state.availableVariants.find(v => {
        return v.options && v.options.slice(0, optsNeeded).every((val, idx) => val === state.selected[idx]);
      }) || null;
      return match;
    }

    function renderPrice() {
      if (!priceEl) return;
      if (state.matchedVariant) {
        setText(priceEl, formatMoney(state.matchedVariant.price, moneyFormat));
      } else {
        setText(priceEl, '');
      }
    }

    function setError(message) {
      if (!errorEl) return;
      setText(errorEl, message || '');
    }

    function updateCheckoutState() {
      const formValid = !form || form.checkValidity();
      const ready = Boolean(state.matchedVariant && formValid);
      if (checkoutBtn) checkoutBtn.disabled = !ready;
    }

    function onSelectChange(index) {
      const select = selects[index];
      if (!select) return;
      const val = select.value || null;
      state.selected[index] = val;
      for (let i = index + 1; i < 3; i++) {
        state.selected[i] = null;
      }
      for (let i = index + 1; i < numOptions; i++) {
        populateSelect(i);
      }
      state.matchedVariant = findMatchingVariant();
      if (!state.matchedVariant && state.selected.filter(Boolean).length === numOptions) {
        setError('Обрана комбінація недоступна. Спробуйте інші параметри.');
      } else {
        setError('');
      }
      renderPrice();
      updateCheckoutState();
      const mainImg = root.querySelector('.x-event__image');
      if (mainImg && state.matchedVariant && state.matchedVariant.image) {
        mainImg.setAttribute('src', state.matchedVariant.image);
      }
      if (hasTriedSubmit) {
        applyValidationHighlight(true);
      } else {
        for (let i = 0; i < numOptions; i++) {
          if (selects[i]) selects[i].setAttribute('aria-invalid', 'false');
        }
      }
    }

    for (let i = 0; i < numOptions; i++) {
      populateSelect(i);
      if (selects[i]) {
        selects[i].addEventListener('change', onSelectChange.bind(null, i));
      }
    }

    for (let i = 0; i < numOptions; i++) {
      const allowed = getAllowedValuesAtIndex(i);
      if (allowed.length === 1) {
        state.selected[i] = allowed[0];
        if (selects[i]) selects[i].value = allowed[0];
      }
      for (let j = i + 1; j < numOptions; j++) populateSelect(j);
    }

    state.matchedVariant = findMatchingVariant();
    renderPrice();
    updateCheckoutState();
    for (let i = 0; i < numOptions; i++) {
      if (selects[i]) selects[i].setAttribute('aria-invalid', 'false');
    }

    const thumbs = root.querySelectorAll('.x-event__thumb');
    if (thumbs && thumbs.length) {
      thumbs.forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-image');
          const main = root.querySelector('.x-event__image');
          if (target && main) main.setAttribute('src', target);
        });
      });
    }

    function checkAndMark(showHighlight) {
      let firstInvalid = null;
      if (form) {
        const inputs = form.querySelectorAll('.x-event__input, .x-event__select');
        inputs.forEach((input) => {
          const valid = input.checkValidity();
          if (showHighlight) input.setAttribute('aria-invalid', valid ? 'false' : 'true');
          else input.setAttribute('aria-invalid', 'false');
          if (!valid && !firstInvalid) firstInvalid = input;
        });
      }
      for (let i = 0; i < numOptions; i++) {
        const s = selects[i];
        if (!s) continue;
        const allowed = getAllowedValuesAtIndex(i);
        const invalid = (s.value === '' && allowed.length > 0);
        if (showHighlight) s.setAttribute('aria-invalid', invalid ? 'true' : 'false');
        else s.setAttribute('aria-invalid', 'false');
        if (invalid && !firstInvalid) firstInvalid = s;
      }
      updateCheckoutState();
      return { valid: !firstInvalid, firstInvalid };
    }
    const validateOnInput = debounce(function () { checkAndMark(hasTriedSubmit); }, 150);

    if (form) {
      form.addEventListener('input', validateOnInput);
      form.addEventListener('change', validateOnInput);
      form.addEventListener('submit', function (e) { e.preventDefault(); });
    }

    if (desc && descToggle) {
      function expandDesc() {
        const start = desc.getBoundingClientRect().height;
        desc.classList.add('is-expanded');
        desc.style.maxHeight = 'none';
        const end = desc.getBoundingClientRect().height;
        desc.style.maxHeight = start + 'px';
        requestAnimationFrame(() => {
          desc.style.maxHeight = end + 'px';
        });
        const onEnd = () => { desc.style.maxHeight = 'none'; desc.removeEventListener('transitionend', onEnd); };
        desc.addEventListener('transitionend', onEnd);
      }
      function collapseDesc() {
        const start = desc.getBoundingClientRect().height;
        desc.classList.remove('is-expanded');
        desc.style.maxHeight = 'none';
        const end = desc.getBoundingClientRect().height; // collapsed height with clamp
        desc.classList.add('is-expanded');
        desc.style.maxHeight = start + 'px';
        requestAnimationFrame(() => {
          desc.classList.remove('is-expanded');
          desc.style.maxHeight = end + 'px';
        });
        const onEnd = () => { desc.style.maxHeight = ''; desc.removeEventListener('transitionend', onEnd); };
        desc.addEventListener('transitionend', onEnd);
      }
      descToggle.addEventListener('click', function () {
        const expanded = desc.classList.contains('is-expanded');
        if (!expanded) expandDesc(); else collapseDesc();
        const nowExpanded = !expanded;
        descToggle.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
        descToggle.textContent = nowExpanded ? 'Згорнути' : 'Читати повністю';
      });
    }

    const isMobile = window.matchMedia('(max-width: 40rem)');
    function setFormCollapsed(collapsed) {
      if (!form) return;
      form.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
      if (formToggle) formToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (formToggle && form) {
      if (isMobile.matches) setFormCollapsed(true);
      formToggle.addEventListener('click', function () {
        const collapsed = form.getAttribute('data-collapsed') !== 'false';
        if (collapsed) {
          form.style.maxHeight = '0px';
          const fullHeight = form.scrollHeight;
          requestAnimationFrame(() => {
            form.style.maxHeight = fullHeight + 'px';
            setFormCollapsed(false);
            formToggle.classList.add('is-open');
          });
        } else {
          const currentHeight = form.getBoundingClientRect().height;
          form.style.maxHeight = currentHeight + 'px';
          requestAnimationFrame(() => {
            form.style.maxHeight = '0px';
            setFormCollapsed(true);
            formToggle.classList.remove('is-open');
          });
        }
      });
      isMobile.addEventListener('change', function (e) {
        setFormCollapsed(!e.matches ? false : true);
        form.style.maxHeight = '';
        if (!e.matches) {
          formToggle.classList.remove('is-open');
        }
      });
    }

    async function addToCart(variantId, properties) {
      const body = { id: variantId, quantity: 1, properties: properties };
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Add to cart failed');
      return res.json();
    }

    async function updateCartAttributes(attributes) {
      try {
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ attributes })
        });
      } catch (_e) {
      }
    }

    function collectFormData() {
      if (!form) return { properties: {}, attributes: {} };
      const data = new FormData(form);
      const firstName = (data.get('first_name') || '').toString().trim();
      const lastName = (data.get('last_name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const phone = (data.get('phone') || '').toString().trim();
      const postal = (data.get('postal_code') || '').toString().trim();
      const birth = (data.get('birth_date') || '').toString().trim();
      const gender = (data.get('gender') || '').toString().trim();
      const userCode = (data.get('user_code') || '').toString().trim();

      const properties = {
        'Ім’я': firstName,
        'Прізвище': lastName,
        'Імейл': email,
        'Телефон': phone,
        'Поштовий код': postal,
        'Дата народження': birth,
        'Гендер': gender
      };
      if (userCode) properties['Код користувача'] = userCode;

      const attributes = {
        reg_first_name: firstName,
        reg_last_name: lastName,
        reg_email: email,
        reg_phone: phone,
        reg_postal_code: postal,
        reg_birth_date: birth,
        reg_gender: gender,
        reg_user_code: userCode
      };
      return { properties, attributes };
    }

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', async function () {
        hasTriedSubmit = true;
        const { valid, firstInvalid } = checkAndMark(true);
        if (!state.matchedVariant || !valid) {
          if (form && form.getAttribute('data-collapsed') === 'true') {
            form.setAttribute('data-collapsed', 'false');
            if (formToggle) formToggle.setAttribute('aria-expanded', 'true');
          }
          if (firstInvalid) firstInvalid.focus();
          return;
        }
        checkoutBtn.disabled = true;
        try {
          const { properties, attributes } = collectFormData();
          await addToCart(state.matchedVariant.id, properties);
          updateCartAttributes(attributes);
          window.location.href = '/checkout';
        } catch (e) {
          console.error('x-event: checkout error', e);
          setError('Сталася помилка під час додавання до кошика. Спробуйте ще раз.');
          checkoutBtn.disabled = false;
        }
      });
    }
  }

  function initAll() {
    const roots = document.querySelectorAll('.x-event');
    roots.forEach(initSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();


