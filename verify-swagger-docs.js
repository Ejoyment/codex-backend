/**
 * Verification script for Swagger documentation
 * Checks which route files have Swagger documentation
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'));

console.log('🔍 Checking Swagger documentation in route files...\n');

const results = {
  total: routeFiles.length,
  withSwagger: 0,
  withoutSwagger: 0,
  details: []
};

routeFiles.forEach(file => {
  const filePath = path.join(routesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const hasSwagger = content.includes('@swagger');
  
  results.details.push({
    file,
    hasSwagger,
    endpoints: countEndpoints(content)
  });
  
  if (hasSwagger) {
    results.withSwagger++;
  } else {
    results.withoutSwagger++;
  }
});

console.log('📊 RESULTS:\n');
console.log(`Total route files: ${results.total}`);
console.log(`With Swagger documentation: ${results.withSwagger}`);
console.log(`Without Swagger documentation: ${results.withoutSwagger}`);
console.log(`Coverage: ${((results.withSwagger / results.total) * 100).toFixed(1)}%\n`);

console.log('📋 DETAILED BREAKDOWN:\n');

results.details.forEach(detail => {
  const status = detail.hasSwagger ? '✅' : '❌';
  console.log(`${status} ${detail.file.padEnd(30)} - Endpoints: ${detail.endpoints}`);
});

console.log('\n🚨 FILES NEEDING SWAGGER DOCUMENTATION:\n');

results.details
  .filter(detail => !detail.hasSwagger)
  .forEach(detail => {
    console.log(`❌ ${detail.file}`);
  });

console.log('\n🎯 RECOMMENDED ACTIONS:');
console.log('1. Add @swagger documentation to files marked with ❌');
console.log('2. Run this script again to verify completion');
console.log('3. Test Swagger UI at /api-docs');

function countEndpoints(content) {
  // Count router.METHOD calls
  const methods = ['get', 'post', 'put', 'delete', 'patch'];
  let count = 0;
  
  methods.forEach(method => {
    const regex = new RegExp(`router\\.${method}\\(`, 'g');
    const matches = content.match(regex);
    if (matches) {
      count += matches.length;
    }
  });
  
  return count;
}

// Export for testing
if (require.main === module) {
  // Run as script
  console.log('\n✅ Verification complete!');
}