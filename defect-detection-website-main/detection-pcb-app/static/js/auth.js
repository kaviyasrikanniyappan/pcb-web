// ===========================================
// PCB VISION - AUTHENTICATION JAVASCRIPT
// Modern Authentication System with Enhanced UX
// ===========================================

// Global state management
const AuthState = {
    isLoading: false,
    currentForm: null,
    errors: new Map()
};

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Show loading overlay with custom message
 * @param {string} message - Loading message to display
 */
function showAuthLoading(message = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    if (overlay && loadingText) {
        loadingText.textContent = message;
        overlay.classList.add('show');
        AuthState.isLoading = true;
    }
}

/**
 * Hide loading overlay
 */
function hideAuthLoading() {
    const overlay = document.getElementById('loading-overlay');

    if (overlay) {
        overlay.classList.remove('show');
        AuthState.isLoading = false;
    }
}

/**
 * Show error message with animation
 * @param {string} message - Error message to display
 * @param {string} type - Error type ('error', 'warning', 'info')
 */
function showAuthError(message, type = 'error') {
    // Remove existing error
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }

    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = `auth-error auth-error-${type}`;

    const iconClass = type === 'error' ? 'fa-exclamation-triangle' :
                     type === 'warning' ? 'fa-exclamation-circle' : 'fa-info-circle';

    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas ${iconClass}"></i>
            <span>${message}</span>
            <button class="error-close" onclick="hideAuthError()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Insert before form
    const form = document.querySelector('.auth-form');
    if (form) {
        form.parentNode.insertBefore(errorDiv, form);
    }

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

/**
 * Hide error message
 */
function hideAuthError() {
    const error = document.querySelector('.auth-error');
    if (error) {
        error.remove();
    }
}

/**
 * Show success message
 * @param {string} message - Success message to display
 */
function showAuthSuccess(message) {
    // Remove existing messages
    hideAuthError();

    const successDiv = document.createElement('div');
    successDiv.className = 'auth-success';
    successDiv.innerHTML = `
        <div class="success-content">
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        </div>
    `;

    const form = document.querySelector('.auth-form');
    if (form) {
        form.parentNode.insertBefore(successDiv, form);
    }

    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 3000);
}

/**
 * Toggle password visibility
 * @param {string} inputId - ID of the password input
 */
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + '-icon');

    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }
}

/**
 * Set button loading state
 * @param {string} buttonId - ID of the button
 * @param {boolean} loading - Loading state
 * @param {string} text - Button text
 */
function setButtonLoading(buttonId, loading, text = '') {
    const btn = document.getElementById(buttonId);
    const btnText = document.getElementById(buttonId + '-text');

    if (btn && btnText) {
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
            btnText.textContent = text || 'Processing...';
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
            btnText.textContent = text;
        }
    }
}

// ===========================================
// FORM VALIDATION
// ===========================================

/**
 * Validate form inputs
 * @param {string} formId - ID of the form to validate
 * @returns {boolean} - True if form is valid
 */
function validateAuthForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const inputs = form.querySelectorAll('input[required]');
    let isValid = true;
    AuthState.errors.clear();

    inputs.forEach(input => {
        const formGroup = input.closest('.form-group');
        if (!formGroup) return;

        // Clear previous errors
        const existingError = formGroup.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        formGroup.classList.remove('error', 'success');

        const value = input.value.trim();
        const fieldName = input.name || input.id;

        // Required field validation
        if (!value) {
            isValid = false;
            showFieldError(formGroup, 'This field is required');
            AuthState.errors.set(fieldName, 'This field is required');
            return;
        }

        // Email validation
        if (input.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                isValid = false;
                showFieldError(formGroup, 'Please enter a valid email address');
                AuthState.errors.set(fieldName, 'Please enter a valid email address');
                return;
            }
        }

        // Password validation
        if (input.type === 'password' && input.name === 'password') {
            if (value.length < 6) {
                isValid = false;
                showFieldError(formGroup, 'Password must be at least 6 characters');
                AuthState.errors.set(fieldName, 'Password must be at least 6 characters');
                return;
            }

            // Password strength indicator
            updatePasswordStrength(formGroup, value);
        }

        // Confirm password validation
        if (input.name === 'confirm_password') {
            const password = document.getElementById('register-password')?.value || '';
            if (value !== password) {
                isValid = false;
                showFieldError(formGroup, 'Passwords do not match');
                AuthState.errors.set(fieldName, 'Passwords do not match');
                return;
            }
        }

        // Name validation
        if (input.name === 'name') {
            if (value.length < 2) {
                isValid = false;
                showFieldError(formGroup, 'Name must be at least 2 characters');
                AuthState.errors.set(fieldName, 'Name must be at least 2 characters');
                return;
            }
        }

        // Mark as success
        formGroup.classList.add('success');
    });

    return isValid;
}

/**
 * Show field error
 * @param {Element} formGroup - Form group element
 * @param {string} message - Error message
 */
function showFieldError(formGroup, message) {
    formGroup.classList.add('error');
    const error = document.createElement('span');
    error.className = 'error-message';
    error.textContent = message;
    formGroup.appendChild(error);
}

/**
 * Update password strength indicator
 * @param {Element} formGroup - Form group element
 * @param {string} password - Password value
 */
function updatePasswordStrength(formGroup, password) {
    // Remove existing strength indicator
    const existingStrength = formGroup.querySelector('.password-strength');
    if (existingStrength) {
        existingStrength.remove();
    }

    // Calculate strength
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength > 0) {
        const strengthDiv = document.createElement('div');
        strengthDiv.className = 'password-strength';

        const strengthText = strength <= 2 ? 'Weak' : strength <= 3 ? 'Medium' : 'Strong';
        const strengthClass = strength <= 2 ? 'weak' : strength <= 3 ? 'medium' : 'strong';

        strengthDiv.innerHTML = `
            <div class="strength-bar">
                <div class="strength-fill ${strengthClass}" style="width: ${(strength / 5) * 100}%"></div>
            </div>
            <span class="strength-text ${strengthClass}">${strengthText}</span>
        `;

        formGroup.appendChild(strengthDiv);
    }
}

// ===========================================
// AUTHENTICATION HANDLERS
// ===========================================

/**
 * Handle login form submission
 * @param {Event} event - Form submit event
 */
async function handleLogin(event) {
    event.preventDefault();

    if (AuthState.isLoading) return;

    const formId = 'login-form';
    if (!validateAuthForm(formId)) {
        return;
    }

    const btnId = 'login-btn';
    const originalText = document.getElementById(btnId + '-text')?.textContent || 'Sign In';

    setButtonLoading(btnId, true, 'Signing In...');
    showAuthLoading('Authenticating...');

    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    const rememberMe = document.getElementById('remember-me')?.checked || false;

    try {
        console.debug('Login payload', { email, password: password ? '***' : '', rememberMe });
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password, remember: rememberMe }),
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        console.debug('Login response', response.status, data);

        if (response.ok && data.success) {
            showAuthLoading('Welcome back! Redirecting...');
            showAuthSuccess('Login successful!');

            setTimeout(() => {
                window.location.href = data.redirect || '/';
            }, 800);
            return;
        }

        hideAuthLoading();
        setButtonLoading(btnId, false, originalText);
        showAuthError(data.message || `Login failed (${response.status}). Please check your credentials.`);
    } catch (error) {
        console.error('Login error:', error);
        hideAuthLoading();
        setButtonLoading(btnId, false, originalText);
        showAuthError('Network or server error occurred. Please try again.');
    }
}

/**
 * Handle register form submission
 * @param {Event} event - Form submit event
 */
async function handleRegister(event) {
    event.preventDefault();

    if (AuthState.isLoading) return;

    const formId = 'register-form';
    if (!validateAuthForm(formId)) {
        return;
    }

    const btnId = 'register-btn';
    const originalText = document.getElementById(btnId + '-text')?.textContent || 'Create Account';

    setButtonLoading(btnId, true, 'Creating Account...');
    showAuthLoading('Setting up your account...');

    const name = document.getElementById('register-name')?.value;
    const email = document.getElementById('register-email')?.value;
    const password = document.getElementById('register-password')?.value;

    try {
        console.debug('Register payload', { name, email, password: password ? '***' : '' });
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password }),
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        console.debug('Register response', response.status, data);

        if (response.ok && data.success) {
            showAuthLoading('Account created! Redirecting...');
            showAuthSuccess('Account created successfully!');

            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            return;
        }

        hideAuthLoading();
        setButtonLoading(btnId, false, originalText);
        showAuthError(data.message || `Registration failed (${response.status}). Please try again.`);
    } catch (error) {
        console.error('Registration error:', error);
        hideAuthLoading();
        setButtonLoading(btnId, false, originalText);
        showAuthError('Network or server error occurred. Please try again.');
    }
}

// ===========================================
// REAL-TIME VALIDATION
// ===========================================

/**
 * Setup real-time validation for register form
 */
function setupRealtimeValidation() {
    // Password confirmation validation
    const confirmPassword = document.getElementById('register-confirm-password');
    if (confirmPassword) {
        confirmPassword.addEventListener('input', function() {
            const password = document.getElementById('register-password')?.value || '';
            const formGroup = this.closest('.form-group');
            const errorMessage = formGroup.querySelector('.error-message');

            // Remove existing error
            if (errorMessage) {
                errorMessage.remove();
            }
            formGroup.classList.remove('error', 'success');

            if (this.value && password !== this.value) {
                formGroup.classList.add('error');
                showFieldError(formGroup, 'Passwords do not match');
            } else if (this.value && password === this.value) {
                formGroup.classList.add('success');
            }
        });
    }

    // Password strength on input
    const passwordInput = document.getElementById('register-password');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const formGroup = this.closest('.form-group');
            updatePasswordStrength(formGroup, this.value);
        });
    }
}

// ===========================================
// INITIALIZATION
// ===========================================

/**
 * Initialize authentication page
 */
function initAuthPage() {
    // Setup particles animation
    const particles = document.querySelectorAll('.particle');
    particles.forEach((particle, index) => {
        particle.style.animationDelay = `${index * 0.5}s`;
    });

    // Setup real-time validation
    setupRealtimeValidation();

    // Focus first input
    const firstInput = document.querySelector('input[required]');
    if (firstInput) {
        firstInput.focus();
    }

    // Setup keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to submit form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const activeForm = document.querySelector('.auth-form');
            if (activeForm) {
                const submitBtn = activeForm.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                }
            }
        }
    });

    // Setup form validation on blur
    document.addEventListener('blur', function(e) {
        if (e.target.tagName === 'INPUT' && e.target.hasAttribute('required')) {
            const formGroup = e.target.closest('.form-group');
            if (formGroup && e.target.value.trim()) {
                // Quick validation on blur
                const fieldName = e.target.name || e.target.id;
                const existingError = AuthState.errors.get(fieldName);
                if (existingError) {
                    // Re-validate this field
                    const tempForm = document.createElement('form');
                    tempForm.appendChild(e.target.cloneNode(true));
                    if (validateAuthForm(tempForm.id = 'temp')) {
                        AuthState.errors.delete(fieldName);
                        formGroup.classList.remove('error');
                        const errorMsg = formGroup.querySelector('.error-message');
                        if (errorMsg) errorMsg.remove();
                    }
                }
            }
        }
    }, true);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initAuthPage);

// ===========================================
// LEGACY FUNCTIONS (for backward compatibility)
// ===========================================

function showLogin() {
    window.location.href = '/login';
}

function showRegister() {
    window.location.href = '/register';
}

async function logout() {
    try {
        await fetch('/logout', { method: 'GET' });
    } catch (error) {
        console.error('Logout error:', error);
    }
    window.location.href = '/login';
}

// Export functions for global access
window.AuthUtils = {
    showLoading: showAuthLoading,
    hideLoading: hideAuthLoading,
    showError: showAuthError,
    showSuccess: showAuthSuccess,
    togglePassword: togglePassword,
    validateForm: validateAuthForm,
    setButtonLoading: setButtonLoading
};