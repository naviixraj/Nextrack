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
    background: '#1f2937',
    color: '#f3f4f6',
    confirmButtonColor: '#3b82f6',
    confirmButtonText: 'OK'
  });
};

window.premiumConfirm = async function(msg, isDestructive = false) {
  const { isConfirmed } = await Swal.fire({
    title: 'Are you sure?',
    text: msg,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: isDestructive ? '#ef4444' : '#3b82f6',
    cancelButtonColor: '#374151',
    confirmButtonText: 'Yes',
    background: '#1f2937',
    color: '#f3f4f6'
  });
  return isConfirmed;
};

window.premiumPrompt = async function(label, type = 'text', defaultValue = '') {
  const { value } = await Swal.fire({
    title: label,
    input: type,
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonColor: '#3b82f6',
    cancelButtonColor: '#374151',
    background: '#1f2937',
    color: '#f3f4f6'
  });
  return value;
};
