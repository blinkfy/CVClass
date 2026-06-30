function renderChips(container, data, labels) {
    if (!container) return;
    if (!data) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    container.innerHTML = '';
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = data[key];
        if (value === null || value === undefined) continue;
        var span = document.createElement('span');
        span.className = 'info-chip';
        var label = labels ? (labels[key] || '') : '';
        if (label) {
            span.innerHTML = label + ': <strong>' + value + '</strong>';
        } else {
            span.innerHTML = '<strong>' + value + '</strong>';
        }
        container.appendChild(span);
    }
}

function clearChips(container) {
    if (container) container.style.display = 'none';
}
