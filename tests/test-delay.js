const aiAgent = require('../src/services/aiAgent');

console.log('Testing Typing Delay Logic...');

const testCases = [
    { text: 'Hi', persona: 'Interested Buyer' },
    { text: 'Hi', persona: 'Elderly Person' },
    { text: 'I am very interested in this offer, please tell me more!', persona: 'Interested Buyer' },
    { text: 'I am very interested in this offer, please tell me more!', persona: 'Elderly Person' }
];

testCases.forEach(t => {
    const delay = aiAgent.calculateTypingDelay(t.text, t.persona);
    console.log(`Text: "${t.text}" | Persona: ${t.persona} | Calculated Delay: ${delay}ms`);
});
