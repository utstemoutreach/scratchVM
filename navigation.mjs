// Navigation management with developer toggle
// This script handles navigation across all pages and the developer toggle

const DEVELOPER_MODE_KEY = 'scratchvm_developer_mode';
const HARDWARE_EXTENSIONS_PAGE = 'hardware-extensions.html';

// Check if developer mode is enabled
function isDeveloperModeEnabled() {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === 'true';
}

// Get current page name
function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    return page;
}

// Build navigation links based on developer mode
function buildNavigationLinks() {
    const currentPage = getCurrentPage();
    //const devMode = isDeveloperModeEnabled();
    
    const links = [
        { href: 'index.html', label: 'Home', id: 'nav-home' },
        { href: 'bug-report.html', label: 'Report Bug', id: 'nav-bug-report' },
        { href: 'video.html', label: 'Tutorial video', id: 'nav-tutorial' },
        //{ href: 'business.html', label: 'Kits & Classes', id: 'nav-business' }
    ];
    
    // Add hardware extensions link only if developer mode is enabled
    /*
    if (devMode) {
        links.push({ href: HARDWARE_EXTENSIONS_PAGE, label: 'Hardware Extensions', id: 'nav-hardware' });
    }
    */
    
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

// Initialize developer toggle
function initDeveloperToggle() {
    const toggle = document.getElementById('devModeToggle');
    if (!toggle) return;
    
    // Set initial state
    toggle.checked = isDeveloperModeEnabled();
    
    // Handle toggle changes
    toggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem(DEVELOPER_MODE_KEY, enabled.toString());
        
        // Refresh navigation to show/hide hardware extensions link
        initNavigation();
        
        // If we're on the hardware extensions page and dev mode is disabled, redirect to home
        if (!enabled && getCurrentPage() === HARDWARE_EXTENSIONS_PAGE) {
            window.location.href = 'index.html';
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    //initDeveloperToggle();
});

// Export functions for use in other scripts
export { isDeveloperModeEnabled, initNavigation };

