var logoImg = document.getElementById('nav-logo-img');
if (logoImg) {
    logoImg.addEventListener('error', function onLogoError() {
        logoImg.removeEventListener('error', onLogoError);
        logoImg.src = 'https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/logo.png';
    });
}

document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
    });
});
