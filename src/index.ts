// ────────────────────────────────────────────────────────────────────────
// 1. Импорт и инициализация
// ────────────────────────────────────────────────────────────────────────
import * as dotenv from 'dotenv';
dotenv.config();

import TelegramBot, { Message } from 'node-telegram-bot-api';

// Токен прямо из среды (или можно жестко прописать)
const TOKEN = process.env.TELEGRAM_TOKEN!;
const bot = new TelegramBot(TOKEN, { polling: true });

// ────────────────────────────────────────────────────────────────────────
// 2. Типы и перечисления
// ────────────────────────────────────────────────────────────────────────
enum BotState {
  AwaitingConsultation,
  AwaitingName,
  AwaitingAge,
  AwaitingWeight,
  AwaitingHeight,
  AwaitingActivity,
  AwaitingGoal,
  AwaitingRecipeType, // новое состояние
  Completed
}

enum ActivityLevel {
  Low = 'низкий',
  Medium = 'средний',
  High = 'высокий'
}

enum Goal {
  Lose = 'похудеть',
  Gain = 'набрать массу',
  Maintain = 'просто узнать норму'
}

interface UserData {
  name?: string;
  age?: number;
  weight?: number;
  height?: number;
  activityLevel?: ActivityLevel;
  goal?: Goal;
}

interface Session {
  state: BotState;
  data: UserData;
}

// Хранилище сессий: chatId → Session
const sessions = new Map<number, Session>();

// ────────────────────────────────────────────────────────────────────────
// 3. Константы формул
// ────────────────────────────────────────────────────────────────────────
const CALORIE_FACTORS = {
  [Goal.Lose]: 0.85,
  [Goal.Gain]: 1.15,
  [Goal.Maintain]: 1.00
};

const WATER_MULTIPLIER = 0.03; // литров на кг

const STEP_NORMS: Record<ActivityLevel, number> = {
  [ActivityLevel.Low]: 5000,
  [ActivityLevel.Medium]: 8000,
  [ActivityLevel.High]: 10000
};

// ────────────────────────────────────────────────────────────────────────
// 4. Вспомогательные функции расчёта
// ────────────────────────────────────────────────────────────────────────
function calculateCalories(weight: number, height: number, age: number, factor: number): number {
  const base = 10 * weight + 6.25 * height - 5 * age - 161;
  return Math.round(base * factor);
}

function calculateWaterIntake(weight: number): number {
  return parseFloat((weight * WATER_MULTIPLIER).toFixed(1));
}

function getStepNorm(activity: ActivityLevel): number {
  return STEP_NORMS[activity];
}

// ────────────────────────────────────────────────────────────────────────
// 5. Функции отправки вопросов
// ────────────────────────────────────────────────────────────────────────
function askConsultation(chatId: number) {
  bot.sendMessage(chatId, 'Выберите консультацию:', {
    reply_markup: {
      keyboard: [
        [{ text: 'КБЖУ + вода + активность' }],
        [{ text: 'ПП рецепты' }]
      ],
      one_time_keyboard: true
    }
  });
}

function askName(chatId: number) {
  bot.sendMessage(chatId, 'Как вас зовут?');
}

function askAge(chatId: number) {
  bot.sendMessage(chatId, 'Сколько вам лет? (введите число)');
}

function askWeight(chatId: number) {
  bot.sendMessage(chatId, 'Ваш вес в килограммах?');
}

function askHeight(chatId: number) {
  bot.sendMessage(chatId, 'Ваш рост в сантиметрах?');
}

function askActivity(chatId: number) {
  bot.sendMessage(chatId, 'Уровень активности?', {
    reply_markup: {
      keyboard: [[
        { text: ActivityLevel.Low },
        { text: ActivityLevel.Medium },
        { text: ActivityLevel.High }
      ]],
      one_time_keyboard: true
    }
  });
}

function askGoal(chatId: number) {
  bot.sendMessage(chatId, 'Ваша цель?', {
    reply_markup: {
      keyboard: [[
        { text: Goal.Lose },
        { text: Goal.Gain },
        { text: Goal.Maintain }
      ]],
      one_time_keyboard: true
    }
  });
}

function askRecipeType(chatId: number) {
  bot.sendMessage(chatId, 'Выберите прием пищи:', {
    reply_markup: {
      keyboard: [
        [{ text: 'Завтрак' }, { text: 'Обед' }],
        [{ text: 'Ужин' }, { text: 'Перекус' }],
        [{ text: 'Напитки' }]
      ],
      one_time_keyboard: true
    }
  });
}

function sendRecipeStub(chatId: number, type: string) {
  let recipe = '';
  switch (type) {
    case 'Завтрак':
      recipe = '🥣 Овсяная каша с ягодами и орехами\n\nИнгредиенты:\n• 50 г овсянки\n• 200 мл молока или воды\n• 30 г смеси ягод (клубника, черника)\n• 1 ст.л. мёда\n• 10 г грецких орехов\n• Щепотка корицы\n\nКалорийность: ~280 ккал\nБелки: 8г, Жиры: 6г, Углеводы: 45г';
      break;
    case 'Обед':
      recipe = '🥗 Куриная грудка с овощами и гречкой\n\nИнгредиенты:\n• 150 г куриной грудки\n• 80 г гречки (сухая)\n• 100 г брокколи\n• 50 г моркови\n• 1 ч.л. оливкового масла\n• Соль, перец по вкусу\n\nПриготовление:\n1. Отварите гречку\n2. Обжарьте грудку на сковороде\n3. Потушите овощи\n4. Подавайте вместе\n\nКалорийность: ~420 ккал\nБелки: 35г, Жиры: 8г, Углеводы: 45г';
      break;
    case 'Ужин':
      recipe = '🐟 Лосось с овощами\n\nИнгредиенты:\n• 120 г филе лосося\n• 100 г стручковой фасоли\n• 50 г помидоров черри\n• 1 ч.л. оливкового масла\n• Лимонный сок\n• Соль, перец, зелень\n\nПриготовление:\n1. Запеките лосось в духовке\n2. Отварите фасоль\n3. Подавайте с овощами\n\nКалорийность: ~320 ккал\nБелки: 28г, Жиры: 18г, Углеводы: 8г';
      break;
    case 'Перекус':
      recipe = '🥛 Творожный десерт с фруктами\n\nИнгредиенты:\n• 100 г творога 5%\n• 1 ст.л. мёда\n• 50 г яблока или груши\n• 10 г изюма\n• Щепотка корицы\n\nКалорийность: ~180 ккал\nБелки: 12г, Жиры: 3г, Углеводы: 25г';
      break;
    case 'Напитки':
      recipe = '🍵 Зеленый чай с имбирем и лимоном\n\nИнгредиенты:\n• 1 ч.л. зеленого чая\n• 2-3 ломтика имбиря\n• 1 долька лимона\n• 1 ч.л. мёда (по желанию)\n• 300 мл горячей воды\n\nПольза: улучшает метаболизм, выводит токсины\nКалорийность: ~15 ккал';
      break;
    default:
      recipe = 'Выберите прием пищи.';
  }
  bot.sendMessage(chatId, recipe);
}

// ────────────────────────────────────────────────────────────────────────
// 6. Обработчик команд и сообщений
// ────────────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg: Message) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, {
    state: BotState.AwaitingConsultation,
    data: {}
  });
  bot.sendMessage(chatId, 'Привет! Я бот для расчёта КБЖУ, воды и шагов.');
  askConsultation(chatId);
});

bot.on('message', (msg: Message) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const session = sessions.get(chatId);
  if (!text || !session) return;

  switch (session.state) {
    case BotState.AwaitingConsultation:
      if (text === 'КБЖУ + вода + активность') {
        session.state = BotState.AwaitingName;
        askName(chatId);
      } else if (text === 'ПП рецепты') {
        session.state = BotState.AwaitingRecipeType;
        askRecipeType(chatId);
      } else {
        askConsultation(chatId);
      }
      break;

    case BotState.AwaitingName:
      session.data.name = text;
      session.state = BotState.AwaitingAge;
      askAge(chatId);
      break;

    case BotState.AwaitingAge:
      const age = Number(text);
      if (isNaN(age) || age <= 0) {
        askAge(chatId);
      } else {
        session.data.age = age;
        session.state = BotState.AwaitingWeight;
        askWeight(chatId);
      }
      break;

    case BotState.AwaitingWeight:
      const weight = Number(text);
      if (isNaN(weight) || weight <= 0) {
        askWeight(chatId);
      } else {
        session.data.weight = weight;
        session.state = BotState.AwaitingHeight;
        askHeight(chatId);
      }
      break;

    case BotState.AwaitingHeight:
      const height = Number(text);
      if (isNaN(height) || height <= 0) {
        askHeight(chatId);
      } else {
        session.data.height = height;
        session.state = BotState.AwaitingActivity;
        askActivity(chatId);
      }
      break;

    case BotState.AwaitingActivity:
      if (
        text === ActivityLevel.Low ||
        text === ActivityLevel.Medium ||
        text === ActivityLevel.High
      ) {
        session.data.activityLevel = text as ActivityLevel;
        session.state = BotState.AwaitingGoal;
        askGoal(chatId);
      } else {
        askActivity(chatId);
      }
      break;

    case BotState.AwaitingGoal:
      if (
        text === Goal.Lose ||
        text === Goal.Gain ||
        text === Goal.Maintain
      ) {
        session.data.goal = text as Goal;
        session.state = BotState.Completed;
      } else {
        askGoal(chatId);
      }
      // после установки state = Completed — не break, чтобы сразу отправить результаты
    // eslint-disable-next-line no-fallthrough
    case BotState.Completed:
      sendResults(chatId, session.data);
      sessions.delete(chatId);
      break;
    case BotState.AwaitingRecipeType:
      if ([
        'Завтрак',
        'Обед',
        'Ужин',
        'Перекус',
        'Напитки'
      ].includes(text)) {
        sendRecipeStub(chatId, text);
        sessions.delete(chatId);
      } else {
        askRecipeType(chatId);
      }
      break;
  }
});

// ────────────────────────────────────────────────────────────────────────
// 7. Функция отправки итогов
// ────────────────────────────────────────────────────────────────────────
function sendResults(chatId: number, data: UserData) {
  const { name, age, weight, height, activityLevel, goal } = data;
  if (!name || age == null || weight == null || height == null || !activityLevel || !goal) {
    bot.sendMessage(chatId, 'Что-то пошло не так, давайте начнём заново: /start');
    return;
  }

  const calories = calculateCalories(weight, height, age, CALORIE_FACTORS[goal]);
  const water = calculateWaterIntake(weight);
  const steps = getStepNorm(activityLevel);

  const resultMessage = `
Привет, ${name}!
Ваши нормы:
• КБЖУ (калории): ${calories} ккал
• Вода: ${water} л/день
• Шаги: ${steps} шагов/день
  `.trim();

  bot.sendMessage(chatId, resultMessage);
} 