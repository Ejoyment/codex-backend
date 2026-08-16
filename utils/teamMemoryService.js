const TeamConvention = require('../models/TeamConvention');

async function getTeamConventions(companyId, category = null, techStack = null) {
    const query = { companyId, isActive: true };
    if (category) query.category = category;
    if (techStack) query.techStack = { $in: [techStack, 'general'] };
    
    return await TeamConvention.find(query).sort({ priority: -1, createdAt: -1 });
}

async function addTeamConvention(data) {
    return await TeamConvention.create(data);
}

async function updateTeamConvention(conventionId, companyId, updates) {
    const convention = await TeamConvention.findOne({ _id: conventionId, companyId });
    if (!convention) throw new Error('Convention not found');
    
    Object.assign(convention, updates);
    await convention.save();
    return convention;
}

async function deleteTeamConvention(conventionId, companyId) {
    const convention = await TeamConvention.findOne({ _id: conventionId, companyId });
    if (!convention) throw new Error('Convention not found');
    
    convention.isActive = false;
    await convention.save();
    return convention;
}

async function getConventionsPrompt(companyId, techStack = null) {
    const conventions = await getTeamConventions(companyId, null, techStack);
    
    if (conventions.length === 0) return '';
    
    const grouped = conventions.reduce((acc, conv) => {
        if (!acc[conv.category]) acc[conv.category] = [];
        acc[conv.category].push(conv);
        return acc;
    }, {});
    
    let prompt = '\n\n=== TEAM ARCHITECTURAL CONVENTIONS ===\n';
    prompt += 'You MUST follow these team-specific rules when generating or reviewing code:\n\n';
    
    for (const [category, rules] of Object.entries(grouped)) {
        prompt += `## ${category.toUpperCase().replace('-', ' ')}\n`;
        rules.forEach(rule => {
            const priority = rule.priority === 'required' ? '[REQUIRED]' : rule.priority === 'recommended' ? '[RECOMMENDED]' : '[OPTIONAL]';
            prompt += `- ${priority} ${rule.rule}`;
            if (rule.description) prompt += `: ${rule.description}`;
            if (rule.examples && rule.examples.length > 0) {
                prompt += `\n  Examples:\n`;
                rule.examples.forEach(ex => prompt += `    - ${ex}\n`);
            }
            prompt += '\n';
        });
        prompt += '\n';
    }
    
    prompt += '=== END TEAM CONVENTIONS ===\n\n';
    return prompt;
}

module.exports = {
    getTeamConventions,
    addTeamConvention,
    updateTeamConvention,
    deleteTeamConvention,
    getConventionsPrompt
};
