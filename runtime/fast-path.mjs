import {spawn} from 'node:child_process';

const NUMBER_WORDS = {
  'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
  'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
  'um': '1', 'dois': '2', 'tres': '3', 'três': '3', 'quatro': '4', 'cinco': '5',
  'seis': '6', 'sete': '7', 'oito': '8', 'nove': '9', 'dez': '10'
};

function runCommand(bin, args = []) {
  try {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'});
    child.unref();
  } catch (err) {
    console.error(`Failed to execute fast-path command ${bin}:`, err);
  }
}

// In-memory cache for recent responses (LRU with TTL)
const RESPONSE_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getCachedResponse(query) {
  const key = query.trim().toLowerCase();
  const entry = RESPONSE_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    RESPONSE_CACHE.delete(key);
    return null;
  }
  return entry.reply;
}

export function cacheResponse(query, reply) {
  if (!query || !reply || reply.length > 500) return;
  const key = query.trim().toLowerCase();
  if (RESPONSE_CACHE.size > 50) {
    const firstKey = RESPONSE_CACHE.keys().next().value;
    RESPONSE_CACHE.delete(firstKey);
  }
  RESPONSE_CACHE.set(key, {reply, time: Date.now()});
}

/**
 * Checks if the text matches a recurrent fast-path command or inquiry.
 * Returns { reply: string, executed: boolean } or null if not a fast-path match.
 */
export function checkFastPath(rawText, { language = 'en' } = {}) {
  if (!rawText) return null;
  let text = rawText.trim().toLowerCase().replace(/[.?!,;:]+$/g, '').trim();
  text = text.replace(/^(hey |ok |please |could you |can you |oma[, ]+)+/g, '').trim();
  const isPt = language === 'pt';

  // 1. Terminal
  if (text.match(/^(open|launch|start|new|i need a) terminal( window)?$/i) || text === 'terminal') {
    runCommand('xdg-terminal-exec');
    return {
      reply: isPt ? 'A abrir o terminal.' : 'Opening terminal.',
      executed: true
    };
  }

  // 2. Browser
  if (text.match(/^(open|launch|start) (the )?(browser|chrome|google chrome|web)$/i) || text === 'browser') {
    runCommand('google-chrome-stable');
    return {
      reply: isPt ? 'A abrir o navegador.' : 'Opening browser.',
      executed: true
    };
  }

  // 3. Audio volume controls
  if (text.match(/^(volume up|turn (it )?up|increase volume|louder|raise volume|mais alto|aumentar volume)$/i)) {
    runCommand('omarchy', ['audio', 'output', 'volume', 'raise']);
    return {
      reply: isPt ? 'Volume aumentado.' : 'Volume up.',
      executed: true
    };
  }

  if (text.match(/^(volume down|turn (it )?down|decrease volume|quieter|lower volume|mais baixo|diminuir volume)$/i)) {
    runCommand('omarchy', ['audio', 'output', 'volume', 'lower']);
    return {
      reply: isPt ? 'Volume reduzido.' : 'Volume down.',
      executed: true
    };
  }

  if (text.match(/^(mute|unmute|mute volume|toggle mute|silenciar|mutar)$/i)) {
    runCommand('omarchy', ['audio', 'output', 'volume', 'mute-toggle']);
    return {
      reply: isPt ? 'Som alternado.' : 'Mute toggled.',
      executed: true
    };
  }

  // 4. Brightness controls
  if (text.match(/^(brightness up|increase brightness|brighter|mais brilho|aumentar brilho)$/i)) {
    runCommand('omarchy', ['brightness', 'display', '+10%']);
    return {
      reply: isPt ? 'Brilho aumentado.' : 'Brightness up.',
      executed: true
    };
  }

  if (text.match(/^(brightness down|decrease brightness|dimmer|menos brilho|diminuir brilho)$/i)) {
    runCommand('omarchy', ['brightness', 'display', '10%-']);
    return {
      reply: isPt ? 'Brilho reduzido.' : 'Brightness down.',
      executed: true
    };
  }

  // 5. Screenshot
  if (text.match(/^(take a screenshot|screenshot|grab screenshot|capture screen|captura de ecrã|capturar ecrã|print)$/i)) {
    runCommand('omarchy', ['screenshot']);
    return {
      reply: isPt ? 'Captura de ecrã efetuada.' : 'Screenshot taken.',
      executed: true
    };
  }

  // 6. Lock screen
  if (text.match(/^(lock( the)? screen|lock( the)? desktop|lock session|bloquear ecrã|bloquear computador)$/i)) {
    runCommand('loginctl', ['lock-session']);
    return {
      reply: isPt ? 'Ecrã bloqueado.' : 'Screen locked.',
      executed: true
    };
  }

  // 7. Close window
  if (text.match(/^(close( this)? window|close( this)? application|close this|fechar janela|fechar isto)$/i)) {
    runCommand('hyprctl', ['dispatch', 'killactive']);
    return {
      reply: isPt ? 'Janela fechada.' : 'Window closed.',
      executed: true
    };
  }

  // 8. Workspaces
  const wsMatch = text.match(/^(?:go to |switch to |move to )?workspace (\w+)$/i) || text.match(/^área de trabalho (\w+)$/i);
  if (wsMatch) {
    const rawTarget = wsMatch[1];
    const target = NUMBER_WORDS[rawTarget] || rawTarget;
    if (target.match(/^[1-9]|10$/)) {
      runCommand('hyprctl', ['dispatch', 'workspace', target]);
      return {
        reply: isPt ? `Área de trabalho ${target}.` : `Workspace ${target}.`,
        executed: true
      };
    }
  }

  if (text.match(/^(next workspace|go to the next workspace|próxima área de trabalho)$/i)) {
    runCommand('hyprctl', ['dispatch', 'workspace', 'e+1']);
    return {
      reply: isPt ? 'Próxima área de trabalho.' : 'Next workspace.',
      executed: true
    };
  }

  if (text.match(/^(previous workspace|last workspace|área de trabalho anterior)$/i)) {
    runCommand('hyprctl', ['dispatch', 'workspace', 'e-1']);
    return {
      reply: isPt ? 'Área de trabalho anterior.' : 'Previous workspace.',
      executed: true
    };
  }

  // 9. Time query
  if (text.match(/^(what time is it|current time|tell me the time|what is the time|time|que horas são)$/i)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString(isPt ? 'pt-PT' : 'en-US', {hour: 'numeric', minute: '2-digit'});
    return {
      reply: isPt ? `São ${timeStr}.` : `It is ${timeStr}.`,
      executed: true
    };
  }

  // 10. Date query
  if (text.match(/^(what is the date|today's date|what day is it|current date|que dia é hoje|data de hoje)$/i)) {
    const now = new Date();
    const dateStr = now.toLocaleDateString(isPt ? 'pt-PT' : 'en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
    return {
      reply: isPt ? `Hoje é ${dateStr}.` : `Today is ${dateStr}.`,
      executed: true
    };
  }

  // 11. Conversational common intents
  if (text.match(/^(hello|hi|hey|good morning|good afternoon|good evening|olá|ola|bom dia|boa tarde)$/i)) {
    return {
      reply: isPt ? 'Olá! Como posso ajudar-te no Omarchy?' : 'Hello! How can I help you on Omarchy today?',
      executed: true
    };
  }

  if (text.match(/^(thank you|thanks|thanks a lot|obrigado|muito obrigado)$/i)) {
    return {
      reply: isPt ? 'De nada! Sempre ao dispor.' : "You're very welcome!",
      executed: true
    };
  }

  if (text.match(/^(who are you|what are you|quem és tu|o que és tu)$/i)) {
    return {
      reply: isPt
        ? 'Sou a O.M.A., assistente nativa do Omarchy com tecnologia Google Antigravity.'
        : 'I am O.M.A., your Omarchy desktop assistant powered by Google Antigravity.',
      executed: true
    };
  }

  // Check LRU query cache
  const cached = getCachedResponse(text);
  if (cached) {
    return {
      reply: cached,
      executed: true,
      fromCache: true
    };
  }

  return null;
}
