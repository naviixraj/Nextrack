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
