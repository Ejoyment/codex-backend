// Quick Integration Status Checker
// Run this in your browser console on any page after logging in

(async function checkIntegrationStatus() {
    console.log('🔍 Checking Integration Status...\n');
    
    const API_URL = 'http://localhost:3000/api';
    const token = localStorage.getItem('authToken');
    
    if (!token) {
        console.error('❌ No auth token found. Please sign in first.');
        return;
    }
    
    console.log('✅ Auth token found\n');
    
    // Check user info
    try {
        const userResponse = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userResponse.json();
        
        if (userData.success) {
            console.log('👤 User Info:');
            console.log(`   Name: ${userData.user.fullName}`);
            console.log(`   Email: ${userData.user.email}`);
            console.log(`   Role: ${userData.user.role?.join(', ') || 'Member'}\n`);
        }
    } catch (error) {
        console.error('❌ Failed to fetch user info:', error.message);
    }
    
    // Check subscription
    try {
        const subResponse = await fetch(`${API_URL}/subscription/current`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const subData = await subResponse.json();
        
        if (subData.success) {
            console.log('💳 Subscription:');
            console.log(`   Tier: ${subData.subscription.tier.toUpperCase()}`);
            console.log(`   Status: ${subData.subscription.status}`);
            console.log(`   AI Messages: ${subData.subscription.aiMessagesUsed}/${subData.subscription.aiMessagesLimit} used\n`);
        }
    } catch (error) {
        console.error('❌ Failed to fetch subscription:', error.message);
    }
    
    // Check integrations
    try {
        const intResponse = await fetch(`${API_URL}/integrations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const intData = await intResponse.json();
        
        if (intData.success) {
            console.log('🔗 Connected Integrations:');
            if (intData.integrations.length === 0) {
                console.log('   None connected yet. Go to Settings to connect.\n');
            } else {
                intData.integrations.forEach(int => {
                    console.log(`   ✅ ${int.provider.toUpperCase()}`);
                    console.log(`      Username: ${int.providerUsername || int.providerEmail || 'N/A'}`);
                    console.log(`      Connected: ${new Date(int.createdAt).toLocaleDateString()}`);
                });
                console.log('');
            }
        }
    } catch (error) {
        console.error('❌ Failed to fetch integrations:', error.message);
    }
    
    // Test GitHub data
    console.log('🐙 Testing GitHub Integration...');
    try {
        const ghResponse = await fetch(`${API_URL}/dashboard/data/github`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const ghData = await ghResponse.json();
        
        if (ghData.success && ghData.connected) {
            console.log(`   ✅ Connected as: ${ghData.integration.username}`);
            if (ghData.data.repositories) {
                console.log(`   📦 Repositories found: ${ghData.data.repositories.length}`);
                if (ghData.data.repositories.length > 0) {
                    console.log('   Top 3 repos:');
                    ghData.data.repositories.slice(0, 3).forEach(repo => {
                        console.log(`      - ${repo.name} (${repo.language || 'N/A'}) ⭐${repo.stars}`);
                    });
                }
            } else {
                console.log('   ⚠️  No repositories data returned');
            }
        } else {
            console.log('   ❌ Not connected. Go to Settings to connect GitHub.');
        }
        console.log('');
    } catch (error) {
        console.error('   ❌ GitHub API error:', error.message);
    }
    
    // Test Discord data
    console.log('💬 Testing Discord Integration...');
    try {
        const dcResponse = await fetch(`${API_URL}/dashboard/data/discord`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dcData = await dcResponse.json();
        
        if (dcData.success && dcData.connected) {
            console.log(`   ✅ Connected as: ${dcData.integration.username}`);
            if (dcData.data.servers) {
                console.log(`   🖥️  Servers found: ${dcData.data.servers.length}`);
                if (dcData.data.servers.length > 0) {
                    console.log('   Your servers:');
                    dcData.data.servers.forEach(server => {
                        console.log(`      - ${server.name} (${server.channels?.length || 0} channels)`);
                    });
                }
            } else {
                console.log('   ⚠️  No servers data returned');
            }
        } else {
            console.log('   ❌ Not connected. Go to Settings to connect Discord.');
        }
        console.log('');
    } catch (error) {
        console.error('   ❌ Discord API error:', error.message);
    }
    
    // Check companies
    console.log('🏢 Testing Team/Company Access...');
    try {
        const compResponse = await fetch(`${API_URL}/company/my-companies`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const compData = await compResponse.json();
        
        if (compData.success) {
            if (compData.companies.length === 0) {
                console.log('   No workspaces yet. Create one on the Teams page!');
            } else {
                console.log(`   📊 Workspaces: ${compData.companies.length}`);
                compData.companies.forEach(comp => {
                    console.log(`      - ${comp.name} (${comp.userRole})`);
                    console.log(`        Members: ${comp.memberCount}/${comp.memberLimit}`);
                    console.log(`        Tier: ${comp.tier}`);
                });
            }
        }
        console.log('');
    } catch (error) {
        console.error('   ❌ Company API error:', error.message);
    }
    
    console.log('✨ Status check complete!\n');
    console.log('📝 Next Steps:');
    console.log('   1. If integrations show "Not connected", go to Settings');
    console.log('   2. If repos/servers show 0, try disconnecting and reconnecting');
    console.log('   3. If you see API errors, check backend logs');
    console.log('   4. To create a workspace, go to Teams page');
})();
