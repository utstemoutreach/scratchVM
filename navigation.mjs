// Get current page name
function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    return page;
}

function buildNavigationLinks() {
    const currentPage = getCurrentPage();
    
    const links = [
        { href: 'index.html', label: 'Home', id: 'nav-home' },
        { href: 'bug-report.html', label: 'Report Bug', id: 'nav-bug-report' },
        { href: 'video.html', label: 'Tutorial video', id: 'nav-tutorial' },
        { href: 'config.html', label: 'Configure & Update', id: 'nav-config'},
    ];
    
    return links;
}

// Initialize navigation
function initNavigation() {
    const navLinksContainer = document.getElementById('navLinks');
    if (!navLinksContainer) return;
    
    const currentPage = getCurrentPage();
    const links = buildNavigationLinks();
    
    // Clear existing links
    navLinksContainer.innerHTML = '';
    
    // Add each link
    links.forEach(link => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.label;
        a.id = link.id;
        
        // Mark active page
        if (link.href === currentPage || (currentPage === '' && link.href === 'index.html')) {
            a.classList.add('active');
        }
        
        li.appendChild(a);
        navLinksContainer.appendChild(li);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
});
