export const goods = {
  wheat: { name: '小麦', stock: 20, basePrice: 2, targetStock: 20 },
  bread: { name: '面包', stock: 20, basePrice: 4, targetStock: 20 },
  water: { name: '饮水', stock: 30, basePrice: 1, targetStock: 30 },
};

// 配方为每工作小时的投入与产出；按 priority 先原料、后加工结算。
export const jobs = {
  farmer: { name: '农夫', workplace: '农田', priority: 0, wage: 2, inputs: {}, outputs: { wheat: 1 } },
  waterCarrier: { name: '挑水工', workplace: '水井', priority: 0, wage: 2, inputs: {}, outputs: { water: 2 } },
  baker: { name: '面包师', workplace: '面包坊', priority: 1, wage: 2, inputs: { wheat: 1 }, outputs: { bread: 2 } },
};

export const residents = [
  { id: 'lin', name: '阿林', job: 'farmer', personality: '勤劳', workStart: 7, workEnd: 17 },
  { id: 'mai', name: '小麦', job: 'baker', personality: '规律', workStart: 8, workEnd: 16 },
  { id: 'he', name: '阿河', job: 'waterCarrier', personality: '悠闲', workStart: 9, workEnd: 15 },
  { id: 'qiu', name: '阿秋', job: 'farmer', personality: '规律', workStart: 8, workEnd: 16 },
];
