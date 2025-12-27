function checkTimeOverlap(start1, end1, start2, end2) {
    const toMinutes = (time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    const s1 = toMinutes(start1);
    let e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    let e2 = toMinutes(end2);

    if (e1 < s1) e1 += 1440;
    if (e2 < s2) e2 += 1440;

    return s1 < e2 && e1 > s2;
}

const tests = [
    { s1: '10:00', e1: '12:00', s2: '12:00', e2: '14:00', expect: false, desc: 'Abutting' },
    { s1: '10:00', e1: '12:00', s2: '11:00', e2: '13:00', expect: true, desc: 'Simple Overlap' },
    { s1: '10:00', e1: '12:00', s2: '09:00', e2: '11:00', expect: true, desc: 'Overlap Start' },
    { s1: '22:00', e1: '02:00', s2: '23:00', e2: '01:00', expect: true, desc: 'Midnight Wrap (Container)' },
    { s1: '22:00', e1: '02:00', s2: '01:00', e2: '03:00', expect: false, desc: 'Same Day Early vs Late (No Overlap)' },
    // Simulate "Yesterday Wrap" check manually since function is pure
    // If Shift 1 is Yesterday (22:00-02:00) -> its effectively 00:00-02:00 on Today.
    // Shift 2 is Today (01:00-03:00).
    // This requires external logic (which I added to API/Frontend). 
    // This test script strictly checks the SHARED checkTimeOverlap function.
];

let failed = false;
tests.forEach(t => {
    const result = checkTimeOverlap(t.s1, t.e1, t.s2, t.e2);
    const status = result === t.expect ? 'PASS' : 'FAIL';
    console.log(`${t.desc}: ${status} (Expected ${t.expect}, Got ${result})`);
    if (result !== t.expect) failed = true;
});

if (failed) process.exit(1);
