const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Archivo de datos persistentes
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Cargar datos desde archivo
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error al cargar datos:', error);
    }
    return {};
}

// Guardar datos en archivo
function saveData(users) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error al guardar datos:', error);
    }
}

// Almacenamiento persistente
let users = loadData();

// Generar nuevo usuario
app.post('/api/user/create', (req, res) => {
    const userId = uuidv4();
    users[userId] = {
        id: userId,
        createdAt: new Date().toISOString(),
        habits: {},
        stats: {
            totalHabits: 0,
            totalCompletions: 0,
            currentStreak: 0,
            longestStreak: 0
        }
    };
    saveData(users);
    res.json({ userId, message: 'Usuario creado exitosamente' });
});

// Iniciar sesión con ID
app.post('/api/user/login', (req, res) => {
    const { userId } = req.body;
    if (users[userId]) {
        res.json({ success: true, user: users[userId] });
    } else {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
});

// Obtener datos del usuario
app.get('/api/user/:userId', (req, res) => {
    const { userId } = req.params;
    if (users[userId]) {
        res.json(users[userId]);
    } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
    }
});

// Crear nuevo hábito
app.post('/api/habits', (req, res) => {
    const { userId, habitName, description, category } = req.body;
    if (!users[userId]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const habitId = uuidv4();
    users[userId].habits[habitId] = {
        id: habitId,
        name: habitName,
        description: description || '',
        category: category || 'General',
        createdAt: new Date().toISOString(),
        completions: [],
        streak: 0
    };
    
    users[userId].stats.totalHabits++;
    saveData(users);
    res.json({ success: true, habitId });
});

// Marcar hábito como completado
app.post('/api/habits/complete', (req, res) => {
    const { userId, habitId, date } = req.body;
    const completionDate = date || new Date().toISOString().split('T')[0];
    
    if (!users[userId] || !users[userId].habits[habitId]) {
        return res.status(404).json({ error: 'Usuario o hábito no encontrado' });
    }
    
    const habit = users[userId].habits[habitId];
    if (!habit.completions.includes(completionDate)) {
        habit.completions.push(completionDate);
        habit.completions.sort();
        users[userId].stats.totalCompletions++;
        
        // Calcular racha
        updateStreaks(users[userId]);
        saveData(users);
    }
    
    res.json({ success: true });
});

// Obtener análisis de hábitos
app.get('/api/analytics/:userId', (req, res) => {
    const { userId } = req.params;
    if (!users[userId]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const analytics = generateAnalytics(users[userId]);
    res.json(analytics);
});

// Función para actualizar rachas
function updateStreaks(user) {
    let maxStreak = 0;
    let currentStreak = 0;
    
    Object.values(user.habits).forEach(habit => {
        const streak = calculateStreak(habit.completions);
        habit.streak = streak;
        maxStreak = Math.max(maxStreak, streak);
    });
    
    user.stats.longestStreak = maxStreak;
    user.stats.currentStreak = getCurrentStreak(user);
}

// Calcular racha de un hábito
function calculateStreak(completions) {
    if (completions.length === 0) return 0;
    
    const today = new Date();
    const sortedDates = completions.map(d => new Date(d)).sort((a, b) => b - a);
    
    let streak = 0;
    let currentDate = new Date(today);
    
    for (let completion of sortedDates) {
        const diffDays = Math.floor((currentDate - completion) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
            streak++;
            currentDate = new Date(completion);
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    return streak;
}

// Obtener racha actual del usuario
function getCurrentStreak(user) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let todayCompletions = 0;
    let yesterdayCompletions = 0;
    
    Object.values(user.habits).forEach(habit => {
        if (habit.completions.includes(today)) todayCompletions++;
        if (habit.completions.includes(yesterdayStr)) yesterdayCompletions++;
    });
    
    return todayCompletions > 0 ? Math.max(todayCompletions, yesterdayCompletions) : 0;
}

// Generar análisis detallado
function generateAnalytics(user) {
    const habits = Object.values(user.habits);
    const totalHabits = habits.length;
    const totalCompletions = user.stats.totalCompletions;
    
    // Análisis por categoría
    const categoryStats = {};
    habits.forEach(habit => {
        if (!categoryStats[habit.category]) {
            categoryStats[habit.category] = { count: 0, completions: 0 };
        }
        categoryStats[habit.category].count++;
        categoryStats[habit.category].completions += habit.completions.length;
    });
    
    // Hábitos más consistentes
    const topHabits = habits
        .map(h => ({ name: h.name, streak: h.streak, completions: h.completions.length }))
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 3);
    
    // Progreso semanal
    const weeklyProgress = getWeeklyProgress(habits);
    
    return {
        summary: {
            totalHabits,
            totalCompletions,
            currentStreak: user.stats.currentStreak,
            longestStreak: user.stats.longestStreak,
            completionRate: totalHabits > 0 ? Math.round((totalCompletions / (totalHabits * 30)) * 100) : 0
        },
        categoryStats,
        topHabits,
        weeklyProgress
    };
}

// Obtener progreso de la última semana
function getWeeklyProgress(habits) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        let completions = 0;
        habits.forEach(habit => {
            if (habit.completions.includes(dateStr)) completions++;
        });
        
        days.push({
            date: dateStr,
            completions,
            dayName: date.toLocaleDateString('es-ES', { weekday: 'short' })
        });
    }
    return days;
}

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📊 Habit Tracker listo para usar`);
    console.log(`💾 Datos cargados: ${Object.keys(users).length} usuarios`);
});