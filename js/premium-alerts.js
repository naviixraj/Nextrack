window.alert = function(msg) {
  let icon = 'info';
  let text = msg;
  
  if (typeof msg === 'string') {
    if (msg.includes('✅')) { 
      icon = 'success'; 
      text = msg.replace('✅', '').trim(); 
    } else if (msg.includes('⚠️') || msg.includes('🔐') || msg.includes('🚪')) { 
      icon = 'warning'; 
      text = msg.replace(/[⚠️🔐🚪]/g, '').trim(); 
    } else if (msg.includes('❌') || msg.includes('🗑')) { 
      icon = 'error'; 
      text = msg.replace(/[❌🗑]/g, '').trim(); 
    }
  }
  
  Swal.fire({
    text: text,
    icon: icon,
    background: 'rgba(20, 20, 25, 0.7)',
    color: '#f3f4f6',
    buttonsStyling: false,
    customClass: {
      popup: 'glass',
      confirmButton: 'btn btn-primary'
    }
  });
};

window.premiumConfirm = async function(msg, isDestructive = false) {
  const { isConfirmed } = await Swal.fire({
    title: 'Are you sure?',
    text: msg,
    icon: 'warning',
    showCancelButton: true,
    background: 'rgba(20, 20, 25, 0.7)',
    color: '#f3f4f6',
    buttonsStyling: false,
    customClass: {
      popup: 'glass',
      confirmButton: isDestructive ? 'btn btn-warning' : 'btn btn-primary',
      cancelButton: 'btn btn-ghost'
    }
  });
  return isConfirmed;
};

window.premiumPrompt = async function(label, type = 'text', defaultValue = '') {
  const { value } = await Swal.fire({
    title: label,
    input: type,
    inputValue: defaultValue,
    showCancelButton: true,
    background: 'rgba(20, 20, 25, 0.7)',
    color: '#f3f4f6',
    buttonsStyling: false,
    customClass: {
      popup: 'glass',
      confirmButton: 'btn btn-primary',
      cancelButton: 'btn btn-ghost',
      input: 'swal-custom-input'
    }
  });
  return value;
};
