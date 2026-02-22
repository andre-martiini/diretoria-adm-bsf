
function calculateCnpjDv(base) {
    if (base.length !== 12) return "";
    const calc = (str, weights) => {
        let sum = 0;
        for (let i = 0; i < str.length; i++) sum += parseInt(str[i]) * weights[i];
        const rem = sum % 11;
        return rem < 2 ? 0 : 11 - rem;
    };
    const dv1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const dv2 = calc(base + dv1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return `${dv1}${dv2}`;
}

console.log("Expected: 06, Got: " + calculateCnpjDv("108386530001"));
