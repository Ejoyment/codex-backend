// API Configuration
const API_BASE_URL = 'https://codexincenterprise.online/api';

// API Helper Functions
const api = {
    // Sign Up
    signup: async (fullName, email, password) => {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fullName, email, password })
        });
        return await response.json();
    },

    // Sign In
    signin: async (email, password) => {
        const response = await fetch(`${API_BASE_URL}/auth/signin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        return await response.json();
    },

    // Send OTP
    sendOTP: async (email) => {
        const response = await fetch(`${API_BASE_URL}/otp/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        return await response.json();
    },

    // Verify OTP
    verifyOTP: async (email, otp) => {
        const response = await fetch(`${API_BASE_URL}/otp/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, otp })
        });
        return await response.json();
    },

    // Resend OTP
    resendOTP: async (email) => {
        const response = await fetch(`${API_BASE_URL}/otp/resend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        return await response.json();
    },

    // Get Current User
    getCurrentUser: async (token) => {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return await response.json();
    }
};

// Social Auth URLs
const SOCIAL_AUTH = {
    google: `${API_BASE_URL}/auth/google`,
    facebook: `${API_BASE_URL}/auth/facebook`
};
