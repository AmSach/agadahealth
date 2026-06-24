// src/services/notificationService.js
// Client-side local notification scheduling and background alarm loops for medicine reminders

let reminderTimer = null;

/**
 * Checks if browser notifications are supported.
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return 'Notification' in window;
}

/**
 * Requests browser notification permissions.
 * @returns {Promise<string>} - 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'denied';
  return await Notification.requestPermission();
}

/**
 * Gets the current notification permission state.
 * @returns {string}
 */
export function getNotificationPermissionState() {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Triggers an instant notification.
 * @param {string} title
 * @param {object} options
 */
export function triggerInstantNotification(title, options = {}) {
  if (getNotificationPermissionState() !== 'granted') return;
  
  try {
    const defaultOptions = {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'agada-reminder',
      renotify: true,
      ...options
    };
    new Notification(title, defaultOptions);
  } catch (err) {
    console.error("Failed to fire browser notification:", err);
  }
}

/**
 * Starts the client-side background timer loop to check and fire scheduled notifications.
 * @param {Array<object>} cabinetItems - User's active medications.
 * @param {object} timeSettings - e.g. { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
 * @param {Function} onDoseTriggered - Callback function when a dose time is reached.
 */
export function startReminderLoop(cabinetItems, timeSettings, onDoseTriggered) {
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }

  const defaultTimes = {
    Morning: '08:00',
    Afternoon: '13:00',
    Evening: '18:00',
    Bedtime: '22:00',
    ...timeSettings
  };

  // Run the check every 60 seconds
  reminderTimer = setInterval(() => {
    const now = new Date();
    const currentHM = now.toTimeString().substring(0, 5); // "HH:MM"

    // Group items by scheduled slot
    const slotsToFire = [];
    for (const [slot, timeStr] of Object.entries(defaultTimes)) {
      if (currentHM === timeStr) {
        slotsToFire.push(slot);
      }
    }

    if (slotsToFire.length === 0) return;

    // Filter cabinet items scheduled for the triggered slots
    cabinetItems.forEach(item => {
      // Find the ideal take-time from item meta or default to Morning
      const itemSlot = item.meta?.idealTime || 'Morning';
      if (slotsToFire.includes(itemSlot) && item.notificationsEnabled) {
        const title = `💊 Agada Medicine Reminder: ${item.brandName}`;
        const body = `It's time to take your dose of ${item.brandName} (${item.saltComposition}).\nGuideline: ${item.meta?.foodRelation || 'With or without food'}.`;
        
        triggerInstantNotification(title, { body });
        
        if (onDoseTriggered) {
          onDoseTriggered(item, itemSlot);
        }
      }
    });
  }, 60000); // Check once a minute
}

/**
 * Stops the active reminder background timer.
 */
export function stopReminderLoop() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
