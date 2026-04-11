import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SUBJECTS, INITIAL_USERS } from '../data/initialData';
import { generateId } from '../utils/helpers';
import { isSupabaseConfigured, mediaBucketName, supabase } from '../lib/supabase';

const AppContext = createContext(null);
const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF85A1', '#87CEEB', '#95E1D3'];
const CLOUD_CONFIG_REQUIRED_MESSAGE = '当前版本仅支持云端存储，请先配置 Supabase 环境变量后再使用。';
const CLOUD_POSTS_LIMIT = 80;
const CLOUD_PLANS_LIMIT = 80;
const CLOUD_KNOWLEDGE_LIMIT = 80;
const CLOUD_POLL_INTERVAL_MS = 12000;
const AUTH_REQUEST_TIMEOUT_MS = 15000;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_MUTATION_MUTE_MS = 2500;
const AUTH_CACHE_KEY = 'friendcircle_auth_cache_v1';
const CURRENT_USER_CACHE_KEY = 'friendcircle_current_user_cache_v1';
const NOTIFICATIONS_CACHE_KEY = 'friendcircle_notifications_cache_v1';
const STATE_CACHE_KEY = 'friendcircle_state_cache_v1';
const PLAN_DONE_MARKER_ID = '__plan_done__';
const PLAN_CATEGORY_MARKER_ID = '__plan_category__';
const LOCAL_NEW_ITEM_KEEP_MS = 120000;

function getNotificationUserCacheKey(userId) {
  return `friendcircle_notifications_cache_${userId}`;
}

const initialState = {
  currentUser: null,
  users: INITIAL_USERS,
  posts: [],
  plans: [],
  knowledge: [],
  notifications: {},
  loaded: false,
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
}

function isValidAccount(value) {
  return /^[a-z0-9_.-]{3,32}$/.test(normalizeAccount(value));
}

function toUniqueStrings(value) {
  const result = [];
  const seen = new Set();

  ensureArray(value).forEach(item => {
    if (typeof item !== 'string') return;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function pickAvatarColor(seed = '') {
  const code = String(seed).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DEFAULT_COLORS[code % DEFAULT_COLORS.length];
}

function normalizeUsers(users) {
  return ensureArray(users).map(user => {
    const subjects = toUniqueStrings(user?.subjects);
    return {
      ...user,
      friends: toUniqueStrings(user?.friends),
      subjects: subjects.length > 0 ? subjects : [...DEFAULT_SUBJECTS.slice(0, 2)],
      account: normalizeAccount(user?.account || user?.id),
      avatarColor: user?.avatarColor || user?.avatar_color || pickAvatarColor(user?.id),
      bio: user?.bio || '',
      avatar: user?.avatar || null,
      password: user?.password || '',
    };
  });
}

function mergeUsersWithDefaults(users) {
  const defaultUsers = normalizeUsers(INITIAL_USERS);
  const loadedUsers = normalizeUsers(users);
  const mergedUsers = [...loadedUsers];
  const seenAccounts = new Set(loadedUsers.map(user => normalizeAccount(user.account || user.id)));

  defaultUsers.forEach(user => {
    const account = normalizeAccount(user.account || user.id);
    if (seenAccounts.has(account)) return;
    mergedUsers.push({ ...user, account, password: user.password || '123456' });
  });

  return mergedUsers;
}

function normalizeSubjectName(subject) {
  const legacy = {
    math: '数学',
    english: '英语',
    chinese: '语文',
    physics: '物理',
    chemistry: '化学',
    biology: '生物',
    history: '历史',
    geography: '地理',
    politics: '政治',
    other: '其他',
  };
  if (typeof subject !== 'string') return '其他';
  return legacy[subject] || subject;
}

function syncCurrentUser(users, currentUserId) {
  if (!currentUserId) return null;
  return users.find(user => user.id === currentUserId) || null;
}

function serializeCurrentUserSnapshot(user) {
  if (!user?.id) return null;
  return {
    id: user.id,
    account: normalizeAccount(user.account || user.id),
    name: user.name || '新用户',
    bio: user.bio || '',
    avatar: user.avatar || null,
    avatarColor: user.avatarColor || pickAvatarColor(user.id),
    friends: toUniqueStrings(user.friends),
    subjects: toUniqueStrings(user.subjects).length > 0 ? toUniqueStrings(user.subjects) : [...DEFAULT_SUBJECTS.slice(0, 2)],
  };
}

function hashString(value = '') {
  let hash = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildStableLegacyCommentId(comment) {
  const userId = comment?.userId || comment?.user_id || 'unknown';
  const replyToUserId = comment?.replyToUserId || comment?.reply_to_user_id || '';
  const createdAt = comment?.createdAt || comment?.created_at || '';
  const text = String(comment?.text || '').trim();
  const imagePart = toUniqueStrings(comment?.images).join('|');
  const audioPart = ensureArray(comment?.audioFiles || comment?.audio_files)
    .map(file => String(file?.uri || file?.name || '').trim())
    .filter(Boolean)
    .join('|');
  const raw = `${userId}::${replyToUserId}::${createdAt}::${text}::${imagePart}::${audioPart}`;
  return `legacy_${hashString(raw)}`;
}

function normalizeComment(comment) {
  const commentId = String(comment?.id || '').trim() || buildStableLegacyCommentId(comment);
  return {
    id: commentId,
    userId: comment?.userId || comment?.user_id || '',
    replyToUserId: comment?.replyToUserId || comment?.reply_to_user_id || '',
    replyToUserName: comment?.replyToUserName || comment?.reply_to_user_name || '',
    text: comment?.text || '',
    images: toUniqueStrings(comment?.images),
    audioFiles: ensureArray(comment?.audioFiles || comment?.audio_files).map(normalizeAudioFile),
    createdAt: comment?.createdAt || comment?.created_at || new Date().toISOString(),
  };
}

function mergeCommentsById(cloudComments, localComments) {
  const merged = new Map();

  ensureArray(cloudComments).map(normalizeComment).forEach(comment => {
    if (comment?.id) {
      merged.set(comment.id, comment);
    }
  });

  ensureArray(localComments).map(normalizeComment).forEach(comment => {
    if (comment?.id && !merged.has(comment.id)) {
      merged.set(comment.id, comment);
    }
  });

  return Array.from(merged.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function normalizeNotifications(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeReadInteractionIds(value) {
  if (!Array.isArray(value)) return [];
  return toUniqueStrings(value.map(item => String(item || '').trim()).filter(Boolean));
}

function normalizeNotificationEntry(value) {
  const entry = value && typeof value === 'object' ? value : {};
  const commentsReadAt = entry.commentsReadAt || entry.comments_read_at || null;
  return {
    ...entry,
    commentsReadAt: commentsReadAt || null,
    readInteractionIds: normalizeReadInteractionIds(entry.readInteractionIds || entry.read_interaction_ids),
  };
}

function mergeNotificationEntries(primary, secondary) {
  const first = normalizeNotificationEntry(primary);
  const second = normalizeNotificationEntry(secondary);
  const readInteractionIds = normalizeReadInteractionIds([
    ...first.readInteractionIds,
    ...second.readInteractionIds,
  ]);

  const firstReadAt = first.commentsReadAt ? new Date(first.commentsReadAt).getTime() : 0;
  const secondReadAt = second.commentsReadAt ? new Date(second.commentsReadAt).getTime() : 0;
  const commentsReadAt = firstReadAt >= secondReadAt ? first.commentsReadAt : second.commentsReadAt;

  return {
    ...second,
    ...first,
    commentsReadAt: commentsReadAt || null,
    readInteractionIds,
  };
}

function pickLatestTimestamp(a, b) {
  const first = a ? new Date(a).getTime() : 0;
  const second = b ? new Date(b).getTime() : 0;
  if (first >= second) return a || null;
  return b || null;
}

function normalizeAudioFile(file) {
  return {
    name: file?.name || '语音文件',
    uri: file?.uri || '',
  };
}

function normalizePost(item) {
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    text: item?.text || '',
    images: toUniqueStrings(item?.images),
    videos: toUniqueStrings(item?.videos),
    likes: toUniqueStrings(item?.likes),
    comments: ensureArray(item?.comments).map(normalizeComment),
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    uploadStatus: item?.uploadStatus || item?.upload_status || 'done',
    uploadError: item?.uploadError || item?.upload_error || '',
  };
}

function normalizePlan(item) {
  const rawTasks = ensureArray(item?.tasks);
  const marker = rawTasks.find(task => task?.id === PLAN_DONE_MARKER_ID);
  const categoryMarker = rawTasks.find(task => task?.id === PLAN_CATEGORY_MARKER_ID);
  const categoryValue = String(item?.category || categoryMarker?.text || '').trim().toLowerCase();
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    title: item?.title || '',
    date: item?.date || new Date().toISOString(),
    tasks: rawTasks.filter(task => task?.id !== PLAN_DONE_MARKER_ID && task?.id !== PLAN_CATEGORY_MARKER_ID).map(task => ({
      id: task?.id || generateId(),
      text: task?.text || '',
      done: Boolean(task?.done),
      reminderTime: task?.reminderTime || '',
    })),
    category: categoryValue === 'life' ? 'life' : 'study',
    reminderAt: item?.reminderAt || item?.reminder_at || '',
    done: typeof item?.done === 'boolean' ? item.done : Boolean(marker?.done),
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
  };
}

function normalizeKnowledge(item) {
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    subject: normalizeSubjectName(item?.subject),
    question: item?.question || '',
    wrongAnswer: item?.wrongAnswer || item?.wrong_answer || '',
    correctAnswer: item?.correctAnswer || item?.correct_answer || '',
    summary: item?.summary || '',
    images: toUniqueStrings(item?.images),
    questionImages: toUniqueStrings(item?.questionImages || item?.question_images),
    wrongAnswerImages: toUniqueStrings(item?.wrongAnswerImages || item?.wrong_answer_images),
    correctAnswerImages: toUniqueStrings(item?.correctAnswerImages || item?.correct_answer_images),
    summaryImages: toUniqueStrings(item?.summaryImages || item?.summary_images),
    audioFiles: ensureArray(item?.audioFiles || item?.audio_files).map(normalizeAudioFile),
    tags: toUniqueStrings(item?.tags),
    likes: toUniqueStrings(item?.likes),
    comments: ensureArray(item?.comments).map(normalizeComment),
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    type: item?.type || 'knowledge_point',
  };
}

function normalizeMessage(item) {
  return {
    id: item?.id || '',
    userId: item?.userId || item?.user_id || '',
    actorId: item?.actorId || item?.actor_id || '',
    sourceType: item?.sourceType || item?.source_type || 'post',
    sourceId: item?.sourceId || item?.source_id || '',
    sourcePreview: item?.sourcePreview || item?.source_preview || '',
    content: item?.content || '',
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    isRead: Number(item?.isRead ?? item?.is_read ?? 0) === 1 ? 1 : 0,
  };
}

function normalizeInbox(inbox) {
  const value = inbox && typeof inbox === 'object' ? inbox : {};
  return {
    unreadCount: Number(value.unreadCount || 0),
    interactions: ensureArray(value.interactions).map(normalizeMessage),
  };
}

function serializeProfile(user) {
  return {
    id: user.id,
    account: normalizeAccount(user.account || user.id),
    name: user.name?.trim() || '新用户',
    bio: user.bio?.trim() || '',
    avatar: user.avatar || null,
    avatar_color: user.avatarColor || pickAvatarColor(user.id),
    friends: toUniqueStrings(user.friends),
    subjects: toUniqueStrings(user.subjects).length > 0 ? toUniqueStrings(user.subjects) : [...DEFAULT_SUBJECTS.slice(0, 2)],
    updated_at: new Date().toISOString(),
  };
}

function serializePost(post) {
  const normalized = normalizePost(post);
  return {
    id: normalized.id,
    user_id: normalized.userId,
    text: normalized.text,
    images: normalized.images,
    videos: normalized.videos,
    likes: normalized.likes,
    comments: normalized.comments,
    created_at: normalized.createdAt,
  };
}

function serializePlan(plan) {
  const normalized = normalizePlan(plan);
  const serializedTasks = [
    { id: PLAN_CATEGORY_MARKER_ID, text: normalized.category || 'study', done: false, reminderTime: '' },
    ...(normalized.done ? [{ id: PLAN_DONE_MARKER_ID, text: '', done: true, reminderTime: '' }] : []),
    ...normalized.tasks,
  ];
  return {
    id: normalized.id,
    user_id: normalized.userId,
    title: normalized.title,
    date: normalized.date,
    tasks: serializedTasks,
    created_at: normalized.createdAt,
  };
}

function serializeKnowledge(item) {
  const normalized = normalizeKnowledge(item);
  return {
    id: normalized.id,
    user_id: normalized.userId,
    subject: normalized.subject,
    question: normalized.question,
    wrong_answer: normalized.wrongAnswer,
    correct_answer: normalized.correctAnswer,
    summary: normalized.summary,
    images: normalized.images,
    question_images: normalized.questionImages,
    wrong_answer_images: normalized.wrongAnswerImages,
    correct_answer_images: normalized.correctAnswerImages,
    summary_images: normalized.summaryImages,
    audio_files: normalized.audioFiles,
    tags: normalized.tags,
    likes: normalized.likes,
    comments: normalized.comments,
    created_at: normalized.createdAt,
  };
}

function sanitizeLoadedState(parsed) {
  const safeUsers = mergeUsersWithDefaults(parsed?.users);
  const safeCurrentUser = syncCurrentUser(safeUsers, parsed?.currentUser?.id);

  return {
    ...initialState,
    users: safeUsers,
    currentUser: safeCurrentUser,
    posts: ensureArray(parsed?.posts).map(normalizePost),
    plans: ensureArray(parsed?.plans).map(normalizePlan),
    knowledge: ensureArray(parsed?.knowledge).map(normalizeKnowledge),
    notifications: normalizeNotifications(parsed?.notifications),
    loaded: true,
  };
}

function createEmptyLoadedState(notifications = {}) {
  return {
    ...initialState,
    users: [],
    posts: [],
    plans: [],
    knowledge: [],
    notifications: normalizeNotifications(notifications),
    currentUser: null,
    loaded: true,
  };
}

function serializeStateSnapshot(state) {
  return {
    users: ensureArray(state?.users).map(user => ({
      ...user,
      password: '',
    })),
    currentUser: state?.currentUser || null,
    posts: ensureArray(state?.posts),
    plans: ensureArray(state?.plans),
    knowledge: ensureArray(state?.knowledge),
    notifications: normalizeNotifications(state?.notifications),
  };
}

function keepCurrentUserOnSyncError(state) {
  return {
    ...state,
    loaded: true,
  };
}

function buildCloudState(snapshot, currentUserId) {
  const users = normalizeUsers((snapshot?.profiles || []).map(profile => ({
    id: profile.id,
    account: profile.account,
    name: profile.name,
    bio: profile.bio,
    avatar: profile.avatar,
    avatarColor: profile.avatar_color,
    friends: profile.friends,
    subjects: profile.subjects,
  })));

  return {
    ...initialState,
    users,
    currentUser: syncCurrentUser(users, currentUserId),
    posts: ensureArray(snapshot?.posts).map(normalizePost),
    plans: ensureArray(snapshot?.plans).map(normalizePlan),
    knowledge: ensureArray(snapshot?.knowledge).map(normalizeKnowledge),
    notifications: normalizeNotifications(initialState.notifications),
    loaded: true,
  };
}

function mergeCurrentUserFast(state, profile, fallback = {}) {
  const normalized = normalizeUsers([{
    id: profile?.id || fallback.id,
    account: profile?.account || fallback.account,
    name: profile?.name || fallback.name || '新用户',
    bio: profile?.bio || fallback.bio || '',
    avatar: profile?.avatar || fallback.avatar || null,
    avatarColor: profile?.avatar_color || profile?.avatarColor || fallback.avatarColor || pickAvatarColor(profile?.id || fallback.id),
    friends: profile?.friends || fallback.friends || [],
    subjects: profile?.subjects || fallback.subjects || [...DEFAULT_SUBJECTS.slice(0, 2)],
  }])[0];

  const users = [
    ...state.users.filter(user => user.id !== normalized.id),
    normalized,
  ];

  return {
    ...state,
    users,
    currentUser: normalized,
    loaded: true,
  };
}

function buildNewUser(payload) {
  const seed = Date.now().toString(36);
  return {
    id: `user_${seed}`,
    name: payload.name.trim(),
    account: normalizeAccount(payload.account),
    password: payload.password,
    avatar: null,
    avatarColor: pickAvatarColor(seed),
    bio: '',
    friends: [],
    subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...action.payload, loaded: true };

    case 'SWITCH_USER':
      return { ...state, currentUser: syncCurrentUser(state.users, action.payload?.id) };

    case 'LOGIN': {
      const account = normalizeAccount(action.payload?.account);
      const password = action.payload?.password || '';
      const target = state.users.find(
        user => normalizeAccount(user.account || '') === account && (user.password || '') === password
      );
      if (!target) return state;
      return { ...state, currentUser: target };
    }

    case 'REGISTER': {
      const account = normalizeAccount(action.payload?.account);
      const exists = state.users.some(user => normalizeAccount(user.account || '') === account);
      if (!account || exists) return state;
      const newUser = buildNewUser(action.payload);
      return {
        ...state,
        users: [...state.users, newUser],
        currentUser: newUser,
      };
    }

    case 'LOGOUT':
      return { ...state, currentUser: null };

    case 'MARK_NOTIFICATIONS_READ': {
      const userId = action.payload?.userId;
      if (!userId) return state;
      const currentMap = normalizeNotifications(state.notifications);
      const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
      return {
        ...state,
        notifications: {
          ...currentMap,
          [userId]: {
            ...currentUserNotification,
            commentsReadAt: action.payload?.readAt || new Date().toISOString(),
          },
        },
      };
    }

    case 'SET_MESSAGE_INBOX': {
      const userId = action.payload?.userId;
      if (!userId) return state;
      const currentMap = normalizeNotifications(state.notifications);
      const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
      const inbox = normalizeInbox(action.payload?.inbox);

      return {
        ...state,
        notifications: {
          ...currentMap,
          [userId]: {
            ...currentUserNotification,
            unreadCount: inbox.unreadCount,
            interactions: inbox.interactions,
          },
        },
      };
    }

    case 'MARK_INTERACTION_READ': {
      const userId = action.payload?.userId;
      const interactionKey = String(action.payload?.interactionKey || '').trim();
      if (!userId || !interactionKey) return state;
      const currentMap = normalizeNotifications(state.notifications);
      const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
      const currentReadIds = currentUserNotification.readInteractionIds;
      const nextReadAt = action.payload?.readAt || new Date().toISOString();
      if (currentReadIds.includes(interactionKey)) return state;
      return {
        ...state,
        notifications: {
          ...currentMap,
          [userId]: {
            ...currentUserNotification,
            readInteractionIds: [...currentReadIds, interactionKey],
            commentsReadAt: pickLatestTimestamp(currentUserNotification.commentsReadAt, nextReadAt),
          },
        },
      };
    }

    case 'UPDATE_PROFILE': {
      if (!state.currentUser) return state;
      const { name, bio, avatar } = action.payload;
      const users = state.users.map(user =>
        user.id === state.currentUser.id
          ? {
              ...user,
              name: name?.trim() || user.name,
              bio: bio?.trim() || '',
              avatar: avatar || null,
            }
          : user
      );
      return { ...state, users, currentUser: syncCurrentUser(users, state.currentUser.id) };
    }

    case 'ADD_FRIEND': {
      if (!state.currentUser) return state;
      const targetUserId = action.payload;
      if (!targetUserId || targetUserId === state.currentUser.id) return state;

      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id === currentUser.id) {
          return { ...user, friends: toUniqueStrings([...(user.friends || []), targetUserId]) };
        }
        if (user.id === targetUserId) {
          return { ...user, friends: toUniqueStrings([...(user.friends || []), currentUser.id]) };
        }
        return user;
      });

      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'REMOVE_FRIEND': {
      if (!state.currentUser) return state;
      const targetUserId = action.payload;
      if (!targetUserId || targetUserId === state.currentUser.id) return state;

      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id === currentUser.id) {
          return { ...user, friends: (user.friends || []).filter(id => id !== targetUserId) };
        }
        if (user.id === targetUserId) {
          return { ...user, friends: (user.friends || []).filter(id => id !== currentUser.id) };
        }
        return user;
      });

      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'ADD_SUBJECT': {
      if (!state.currentUser) return state;
      const subject = action.payload?.trim();
      if (!subject) return state;
      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id !== currentUser.id) return user;
        if ((user.subjects || []).includes(subject)) return user;
        return { ...user, subjects: [...(user.subjects || []), subject] };
      });
      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'REMOVE_SUBJECT': {
      if (!state.currentUser) return state;
      const subject = action.payload?.trim();
      if (!subject) return state;
      const currentUser = state.currentUser;
      if ((currentUser.subjects || []).length <= 1) return state;
      const users = state.users.map(user => {
        if (user.id !== currentUser.id) return user;
        return { ...user, subjects: (user.subjects || []).filter(item => item !== subject) };
      });
      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'ADD_POST':
      return { ...state, posts: [normalizePost(action.payload), ...state.posts] };

    case 'PATCH_POST_LOCAL': {
      const { postId, changes } = action.payload || {};
      if (!postId || !changes) return state;
      return {
        ...state,
        posts: state.posts.map(post => {
          if (post.id !== postId) return post;
          return normalizePost({ ...post, ...changes });
        }),
      };
    }

    case 'DELETE_POST':
      return { ...state, posts: state.posts.filter(post => post.id !== action.payload) };

    case 'LIKE_POST': {
      const { postId, userId } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post => {
          if (post.id !== postId) return post;
          const liked = (post.likes || []).includes(userId);
          return {
            ...post,
            likes: liked ? post.likes.filter(id => id !== userId) : [...(post.likes || []), userId],
          };
        }),
      };
    }

    case 'ADD_COMMENT': {
      const { postId, comment } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post =>
          post.id === postId
            ? { ...post, comments: [...(post.comments || []), normalizeComment(comment)] }
            : post
        ),
      };
    }

    case 'DELETE_COMMENT': {
      const { postId, commentId } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post =>
          post.id === postId
            ? { ...post, comments: (post.comments || []).filter(comment => comment.id !== commentId) }
            : post
        ),
      };
    }

    case 'ADD_PLAN':
      return { ...state, plans: [normalizePlan(action.payload), ...state.plans] };

    case 'DELETE_PLAN':
      return { ...state, plans: state.plans.filter(plan => plan.id !== action.payload) };

    case 'TOGGLE_PLAN_TASK': {
      const { planId, taskId } = action.payload;
      return {
        ...state,
        plans: state.plans.map(plan => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            tasks: (plan.tasks || []).map(task =>
              task.id === taskId ? { ...task, done: !task.done } : task
            ),
          };
        }),
      };
    }

    case 'TOGGLE_PLAN_DONE': {
      const { planId } = action.payload || {};
      if (!planId) return state;
      return {
        ...state,
        plans: state.plans.map(plan =>
          plan.id === planId ? { ...plan, done: !plan.done } : plan
        ),
      };
    }

    case 'UPDATE_PLAN': {
      return {
        ...state,
        plans: state.plans.map(plan =>
          plan.id === action.payload.id ? normalizePlan({ ...plan, ...action.payload }) : plan
        ),
      };
    }

    case 'ADD_KNOWLEDGE':
      return { ...state, knowledge: [normalizeKnowledge(action.payload), ...state.knowledge] };

    case 'DELETE_KNOWLEDGE':
      return { ...state, knowledge: state.knowledge.filter(item => item.id !== action.payload) };

    case 'UPDATE_KNOWLEDGE':
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === action.payload.id ? normalizeKnowledge({ ...item, ...action.payload }) : item
        ),
      };

    case 'LIKE_KNOWLEDGE': {
      const { knowledgeId, userId } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item => {
          if (item.id !== knowledgeId) return item;
          const liked = (item.likes || []).includes(userId);
          return {
            ...item,
            likes: liked ? item.likes.filter(id => id !== userId) : [...(item.likes || []), userId],
          };
        }),
      };
    }

    case 'ADD_KNOWLEDGE_COMMENT': {
      const { knowledgeId, comment } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === knowledgeId
            ? { ...item, comments: [...(item.comments || []), normalizeComment(comment)] }
            : item
        ),
      };
    }

    case 'DELETE_KNOWLEDGE_COMMENT': {
      const { knowledgeId, commentId } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === knowledgeId
            ? { ...item, comments: (item.comments || []).filter(comment => comment.id !== commentId) }
            : item
        ),
      };
    }

    default:
      return state;
  }
}

function buildAuthEmail(account) {
  return `${normalizeAccount(account)}@friendcircle.app`;
}

function inferFileExtension(uri, fallback = 'bin') {
  const cleanUri = String(uri || '').split('?')[0];
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

function getContentType(extension) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    caf: 'audio/x-caf',
  };
  return map[extension] || 'application/octet-stream';
}

function isRemoteAsset(uri) {
  return /^https?:\/\//i.test(uri || '');
}

async function uploadAssetIfNeeded(userId, uri, folder) {
  if (!uri || isRemoteAsset(uri) || !supabase) return uri;

  const info = await FileSystem.getInfoAsync(uri, { size: true });
  const size = Number(info?.size || 0);
  const isVideoFile = folder.includes('video');
  const maxBytes = isVideoFile ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (size > maxBytes) {
    throw new Error(isVideoFile ? '视频文件过大，请控制在 20MB 以内' : '图片文件过大，请控制在 10MB 以内');
  }

  const extension = inferFileExtension(uri, folder.includes('audio') ? 'm4a' : 'jpg');
  const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

  if (isVideoFile) {
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from(mediaBucketName)
      .createSignedUploadUrl(path);

    if (signedError || !signedData?.signedUrl) {
      throw signedError || new Error('视频上传签名失败');
    }

    const uploadResult = await FileSystem.uploadAsync(signedData.signedUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'content-type': getContentType(extension),
      },
    });

    if (!uploadResult || (uploadResult.status !== 200 && uploadResult.status !== 201)) {
      throw new Error('视频上传失败，请稍后重试');
    }

    const { data } = supabase.storage.from(mediaBucketName).getPublicUrl(path);
    return data.publicUrl;
  }

  let arrayBuffer;

  // 图片与小文件继续走内存上传，兼容性更好
  try {
    const response = await fetch(uri);
    arrayBuffer = await response.arrayBuffer();
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    arrayBuffer = decode(base64);
  }

  const { error } = await supabase.storage.from(mediaBucketName).upload(path, arrayBuffer, {
    contentType: getContentType(extension),
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(mediaBucketName).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadAssetList(userId, items, folder) {
  return Promise.all(toUniqueStrings(items).map(uri => uploadAssetIfNeeded(userId, uri, folder)));
}

async function uploadAssetListSequential(userId, items, folder) {
  const result = [];
  const list = toUniqueStrings(items);
  for (const uri of list) {
    // 视频串行上传更稳定，避免高内存同时峰值导致闪退
    const uploaded = await uploadAssetIfNeeded(userId, uri, folder);
    result.push(uploaded);
  }
  return result;
}

async function uploadAudioFiles(userId, files, folder) {
  const uploaded = await Promise.all(ensureArray(files).map(async file => {
    const normalized = normalizeAudioFile(file);
    if (!normalized.uri) return null;
    return {
      ...normalized,
      uri: await uploadAssetIfNeeded(userId, normalized.uri, folder),
    };
  }));
  return uploaded.filter(Boolean);
}

async function preparePostPayload(userId, payload) {
  return normalizePost({
    ...payload,
    images: await uploadAssetList(userId, payload.images, 'posts/images'),
    videos: await uploadAssetListSequential(userId, payload.videos, 'posts/videos'),
  });
}

async function prepareKnowledgePayload(userId, payload) {
  return normalizeKnowledge({
    ...payload,
    images: await uploadAssetList(userId, payload.images, 'knowledge/images'),
    questionImages: await uploadAssetList(userId, payload.questionImages, 'knowledge/question-images'),
    wrongAnswerImages: await uploadAssetList(userId, payload.wrongAnswerImages, 'knowledge/wrong-answer-images'),
    correctAnswerImages: await uploadAssetList(userId, payload.correctAnswerImages, 'knowledge/correct-answer-images'),
    summaryImages: await uploadAssetList(userId, payload.summaryImages, 'knowledge/summary-images'),
    audioFiles: await uploadAudioFiles(userId, payload.audioFiles, 'knowledge/audio'),
  });
}

async function fetchCloudState(currentUserId) {
  const [profilesRes, postsRes, plansRes, knowledgeRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,account,name,bio,avatar,avatar_color,friends,subjects,created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('posts')
      .select('id,user_id,text,images,videos,likes,comments,created_at')
      .order('created_at', { ascending: false })
      .limit(CLOUD_POSTS_LIMIT),
    supabase
      .from('plans')
      .select('id,user_id,title,date,tasks,created_at')
      .order('date', { ascending: false })
      .limit(CLOUD_PLANS_LIMIT),
    supabase
      .from('knowledge')
      .select('id,user_id,subject,question,wrong_answer,correct_answer,summary,images,question_images,wrong_answer_images,correct_answer_images,summary_images,audio_files,tags,likes,comments,created_at')
      .order('created_at', { ascending: false })
      .limit(CLOUD_KNOWLEDGE_LIMIT),
  ]);

  const error = profilesRes.error || postsRes.error || plansRes.error || knowledgeRes.error;
  if (error) throw error;

  return buildCloudState({
    profiles: profilesRes.data,
    posts: postsRes.data,
    plans: plansRes.data,
    knowledge: knowledgeRes.data,
  }, currentUserId);
}

async function fetchCloudNotificationState(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('notification_reads')
    .select('user_id,read_interaction_ids,last_read_time')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return normalizeNotificationEntry({
    comments_read_at: data.last_read_time,
    read_interaction_ids: data.read_interaction_ids,
  });
}

async function fetchMessageInbox(userId) {
  if (!userId) return normalizeInbox({ unreadCount: 0, interactions: [] });

  const [countRes, listRes] = await Promise.all([
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', 0),
    supabase
      .from('messages')
      .select('id,user_id,actor_id,source_type,source_id,source_preview,content,created_at,is_read')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  if (countRes.error?.message?.includes('relation "messages" does not exist')) {
    throw new Error('messages 表不存在，请先在 Supabase SQL Editor 执行建表 SQL。');
  }
  if (listRes.error?.message?.includes('relation "messages" does not exist')) {
    throw new Error('messages 表不存在，请先在 Supabase SQL Editor 执行建表 SQL。');
  }

  if (countRes.error) throw countRes.error;
  if (listRes.error) throw listRes.error;

  return normalizeInbox({
    unreadCount: Number(countRes.count || 0),
    interactions: listRes.data || [],
  });
}

async function markAllMessagesRead(userId) {
  if (!userId) return normalizeInbox({ unreadCount: 0, interactions: [] });

  const { data, error } = await supabase
    .from('messages')
    .update({ is_read: 1 })
    .eq('user_id', userId)
    .eq('is_read', 0)
    .select();

  console.log('[markAllMessagesRead] 更新条数:', data?.length || 0, 'userId:', userId);

  if (error?.message?.includes('relation "messages" does not exist')) {
    throw new Error('messages 表不存在，请先在 Supabase SQL Editor 执行建表 SQL。');
  }
  if (error) throw error;

  if (!data || data.length === 0) {
    const [{ data: authData }, { count: visibleUnreadCount, error: countError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', 0),
    ]);

    if (countError) {
      console.warn('[markAllMessagesRead] 诊断查询失败:', countError.message);
    } else if ((visibleUnreadCount || 0) > 0) {
      console.warn(
        '[markAllMessagesRead] 可见未读仍大于0但更新条数为0，可能是RLS策略限制了UPDATE或WITH CHECK不满足。',
        'auth.uid=',
        authData?.user?.id,
        'targetUserId=',
        userId,
        'visibleUnreadCount=',
        visibleUnreadCount,
      );
    } else {
      console.warn(
        '[markAllMessagesRead] 更新条数为0，当前可见未读为0，通常是已无未读或user_id过滤条件不匹配。',
        'auth.uid=',
        authData?.user?.id,
        'targetUserId=',
        userId,
      );
    }
  }

  return fetchMessageInbox(userId);
}

async function markOneMessageRead(userId, messageId) {
  if (!userId || !messageId) return fetchMessageInbox(userId);

  const { error } = await supabase
    .from('messages')
    .update({ is_read: 1 })
    .eq('id', messageId)
    .eq('user_id', userId);

  if (error?.message?.includes('relation "messages" does not exist')) {
    throw new Error('messages 表不存在，请先在 Supabase SQL Editor 执行建表 SQL。');
  }

  if (error) throw error;
  return fetchMessageInbox(userId);
}

async function saveCloudNotificationState(userId, entry) {
  if (!userId) return;
  const normalized = normalizeNotificationEntry(entry);

  const payload = {
    user_id: userId,
    read_interaction_ids: normalized.readInteractionIds,
    last_read_time: normalized.commentsReadAt || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('notification_reads')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) throw error;
}

async function clearLocalSessionCache(userId) {
  const keys = [
    AUTH_CACHE_KEY,
    CURRENT_USER_CACHE_KEY,
    NOTIFICATIONS_CACHE_KEY,
    STATE_CACHE_KEY,
  ];
  if (userId) {
    keys.push(getNotificationUserCacheKey(userId));
  }
  await AsyncStorage.multiRemove(keys);
}

async function upsertInteractionMessage({
  userId,
  actorId,
  sourceType,
  sourceId,
  sourcePreview,
  content,
  sourceCommentId,
}) {
  if (!userId || !actorId || userId === actorId) return;

  const basePayload = {
    user_id: userId,
    actor_id: actorId,
    source_type: String(sourceType || 'post'),
    source_id: String(sourceId || ''),
    source_preview: String(sourcePreview || '').slice(0, 120),
    content: String(content || ''),
    is_read: 0,
  };

  const dedupePayload = {
    ...basePayload,
    source_comment_id: sourceCommentId ? String(sourceCommentId) : null,
  };

  const dedupeRes = await supabase
    .from('messages')
    .upsert(dedupePayload, {
      onConflict: 'user_id,actor_id,source_type,source_id,source_comment_id',
      ignoreDuplicates: true,
    });

  if (!dedupeRes.error) return;

  const msg = String(dedupeRes.error?.message || '');
  if (/column .*source_comment_id.* does not exist/i.test(msg) || /no unique|constraint/i.test(msg)) {
    const fallbackRes = await supabase.from('messages').insert(basePayload);
    if (fallbackRes.error) throw fallbackRes.error;
    return;
  }

  throw dedupeRes.error;
}

function isRpcMissing(error, rpcName) {
  const msg = String(error?.message || '');
  return msg.includes(`function public.${rpcName}`) && /does not exist|not found/i.test(msg);
}

async function fetchCloudPatch(tables) {
  const wanted = new Set(ensureArray(tables));
  const tasks = [];

  if (wanted.has('profiles')) {
    tasks.push(
      supabase
        .from('profiles')
        .select('id,account,name,bio,avatar,avatar_color,friends,subjects,created_at')
        .order('created_at', { ascending: true })
        .then(res => ({ key: 'profiles', ...res }))
    );
  }

  if (wanted.has('posts')) {
    tasks.push(
      supabase
        .from('posts')
        .select('id,user_id,text,images,videos,likes,comments,created_at')
        .order('created_at', { ascending: false })
        .limit(CLOUD_POSTS_LIMIT)
        .then(res => ({ key: 'posts', ...res }))
    );
  }

  if (wanted.has('plans')) {
    tasks.push(
      supabase
        .from('plans')
        .select('id,user_id,title,date,tasks,created_at')
        .order('date', { ascending: false })
        .limit(CLOUD_PLANS_LIMIT)
        .then(res => ({ key: 'plans', ...res }))
    );
  }

  if (wanted.has('knowledge')) {
    tasks.push(
      supabase
        .from('knowledge')
        .select('id,user_id,subject,question,wrong_answer,correct_answer,summary,images,question_images,wrong_answer_images,correct_answer_images,summary_images,audio_files,tags,likes,comments,created_at')
        .order('created_at', { ascending: false })
        .limit(CLOUD_KNOWLEDGE_LIMIT)
        .then(res => ({ key: 'knowledge', ...res }))
    );
  }

  const results = await Promise.all(tasks);
  const patch = {};

  for (const item of results) {
    if (item.error) throw item.error;
    patch[item.key] = item.data;
  }

  return patch;
}

function applyCloudPatch(state, patch, currentUserId) {
  const nextState = {
    ...state,
    loaded: true,
  };

  if (patch?.profiles) {
    const incomingUsers = normalizeUsers((patch.profiles || []).map(profile => ({
      id: profile.id,
      account: profile.account,
      name: profile.name,
      bio: profile.bio,
      avatar: profile.avatar,
      avatarColor: profile.avatar_color,
      friends: profile.friends,
      subjects: profile.subjects,
    })));

    // 避免鉴权短暂抖动时 profiles 空结果把本地用户全部清空
    if (incomingUsers.length > 0 || ensureArray(state.users).length === 0) {
      const mergedMap = new Map();
      ensureArray(state.users).forEach(user => {
        if (user?.id) mergedMap.set(user.id, normalizeUsers([user])[0]);
      });
      incomingUsers.forEach(user => {
        if (user?.id) mergedMap.set(user.id, user);
      });
      const users = Array.from(mergedMap.values());
      nextState.users = users;
      nextState.currentUser = syncCurrentUser(users, currentUserId || state.currentUser?.id);
    }
  }

  if (patch?.posts) {
    const cloudPosts = ensureArray(patch.posts).map(normalizePost);
    const localPosts = ensureArray(state.posts).map(normalizePost);
    const localPostMap = new Map(localPosts.map(item => [item.id, item]));
    const cloudIdSet = new Set(cloudPosts.map(item => item.id));
    const retainedLocal = localPosts.filter(item => {
      if (!item?.id || cloudIdSet.has(item.id)) return false;
      if (item.uploadStatus === 'uploading' || item.uploadStatus === 'failed') return true;
      const createdAtMs = new Date(item.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      return Date.now() - createdAtMs <= LOCAL_NEW_ITEM_KEEP_MS;
    });

    nextState.posts = [...retainedLocal, ...cloudPosts.map(item => {
      const localItem = localPostMap.get(item.id);
      if (!localItem) return item;
      return {
        ...item,
        comments: mergeCommentsById(item.comments, localItem.comments),
      };
    })]
      .reduce((acc, item) => {
        if (acc.some(existing => existing.id === item.id)) return acc;
        acc.push(item);
        return acc;
      }, [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (patch?.plans) {
    const cloudPlans = ensureArray(patch.plans).map(normalizePlan);
    const localPlans = ensureArray(state.plans).map(normalizePlan);
    const cloudPlanIds = new Set(cloudPlans.map(item => item.id));
    const retainedLocalPlans = localPlans.filter(item => {
      if (!item?.id || cloudPlanIds.has(item.id)) return false;
      const createdAtMs = new Date(item.createdAt).getTime();
      return Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= LOCAL_NEW_ITEM_KEEP_MS;
    });

    nextState.plans = [...retainedLocalPlans, ...cloudPlans]
      .reduce((acc, item) => {
        if (acc.some(existing => existing.id === item.id)) return acc;
        acc.push(item);
        return acc;
      }, [])
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  if (patch?.knowledge) {
    const cloudKnowledge = ensureArray(patch.knowledge).map(normalizeKnowledge);
    const localKnowledge = ensureArray(state.knowledge).map(normalizeKnowledge);
    const localKnowledgeMap = new Map(localKnowledge.map(item => [item.id, item]));

    nextState.knowledge = cloudKnowledge.map(item => {
      const localItem = localKnowledgeMap.get(item.id);
      if (!localItem) return item;
      return {
        ...item,
        comments: mergeCommentsById(item.comments, localItem.comments),
      };
    });
  }

  return nextState;
}

function getFriendlyErrorMessage(error, fallback) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return '账号或密码错误';
  if (/auth request timeout|timeout|network request failed|failed to fetch|fetch failed/i.test(message)) {
    return '网络连接异常，登录请求超时，请检查网络后重试';
  }
  if (/user already registered/i.test(message)) return '该账号已被注册';
  if (/email rate limit exceeded/i.test(message)) return '请求过于频繁，请稍后再试';
  if (/invalid email|unable to validate email address/i.test(message)) return '账号格式不正确，请使用 3-32 位字母、数字或 . _ -';
  if (/database error saving new user/i.test(message)) return '注册失败，请检查 Supabase 的数据库触发器或重试';
  if (/column .* does not exist/i.test(message)) return '云端表结构版本较旧，请在 Supabase 执行最新 schema.sql';
  if (/文件过大|too large|payload too large|request entity too large/i.test(message)) return '文件过大，请压缩后再上传';
  if (/email not confirmed/i.test(message)) return '当前 Supabase 开启了邮箱确认，请先关闭 Confirm email';
  return fallback;
}

async function withTimeout(taskPromise, timeoutMs, timeoutMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

export function AppProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const currentUserId = state.currentUser?.id || '';
  const cloudUserIdRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pendingTablesRef = useRef(new Set());
  const authBootstrappingRef = useRef(true);
  const localMutationMuteRef = useRef({
    profiles: 0,
    posts: 0,
    plans: 0,
    knowledge: 0,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId) return undefined;

    let active = true;
    const messageChannel = supabase
      .channel(`friendcircle-messages-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${currentUserId}`,
      }, (payload) => {
        if (!active) return;

        const insertedMessage = normalizeMessage(payload?.new);
        const currentMap = normalizeNotifications(stateRef.current.notifications);
        const currentUserNotification = normalizeNotificationEntry(currentMap[currentUserId]);
        const mergedInteractions = [insertedMessage, ...currentUserNotification.interactions.filter(item => item.id !== insertedMessage.id)];
        const unreadCount = mergedInteractions.filter(item => Number(item.isRead || 0) === 0).length;

        const nextUserNotification = {
          ...currentUserNotification,
          unreadCount,
          interactions: mergedInteractions,
        };

        baseDispatch({
          type: 'SET_MESSAGE_INBOX',
          payload: {
            userId: currentUserId,
            inbox: {
              unreadCount,
              interactions: mergedInteractions,
            },
          },
        });

        AsyncStorage.setItem(getNotificationUserCacheKey(currentUserId), JSON.stringify(nextUserNotification)).catch(() => {});
        AsyncStorage.setItem(
          NOTIFICATIONS_CACHE_KEY,
          JSON.stringify({
            ...currentMap,
            [currentUserId]: nextUserNotification,
          }),
        ).catch(() => {});
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${currentUserId}`,
      }, () => {
        if (!active) return;
        fetchMessageInbox(currentUserId)
          .then(inbox => {
            if (!active) return;
            const currentMap = normalizeNotifications(stateRef.current.notifications);
            const currentUserNotification = normalizeNotificationEntry(currentMap[currentUserId]);
            const nextUserNotification = {
              ...currentUserNotification,
              unreadCount: inbox.unreadCount,
              interactions: inbox.interactions,
            };
            baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId: currentUserId, inbox } });
            AsyncStorage.setItem(getNotificationUserCacheKey(currentUserId), JSON.stringify(nextUserNotification)).catch(() => {});
            AsyncStorage.setItem(
              NOTIFICATIONS_CACHE_KEY,
              JSON.stringify({
                ...currentMap,
                [currentUserId]: nextUserNotification,
              }),
            ).catch(() => {});
          })
          .catch(() => {});
      })
      .subscribe();

    fetchMessageInbox(currentUserId)
      .then(inbox => {
        if (!active) return;
        baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId: currentUserId, inbox } });
      })
      .catch(() => {});

    return () => {
      active = false;
      supabase.removeChannel(messageChannel);
    };
  }, [currentUserId]);

  useEffect(() => {
    AsyncStorage
      .setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(normalizeNotifications(state.notifications)))
      .catch(() => {});
  }, [state.notifications]);

  useEffect(() => {
    if (!state.loaded) return;
    const snapshot = serializeStateSnapshot(state);
    AsyncStorage.setItem(STATE_CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, [state]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
      return undefined;
    }

    authBootstrappingRef.current = true;

    let active = true;
    let cachedNotifications = {};

    const loadCachedNotifications = async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFICATIONS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return normalizeNotifications(parsed);
      } catch {
        return {};
      }
    };

    const restoreStateSnapshot = async () => {
      try {
        const raw = await AsyncStorage.getItem(STATE_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const restored = sanitizeLoadedState(parsed);
        if (!restored?.currentUser?.id) return false;
        restored.notifications = {
          ...normalizeNotifications(cachedNotifications),
          ...normalizeNotifications(parsed?.notifications),
        };
        baseDispatch({ type: 'LOAD_STATE', payload: restored });
        return true;
      } catch {
        return false;
      }
    };

    const hydrate = async (userId) => {
      const snapshot = await fetchCloudState(userId);
      if (!active) return;
      cloudUserIdRef.current = userId;

      let cloudNotification = null;
      try {
        cloudNotification = await fetchCloudNotificationState(userId);
      } catch {
        cloudNotification = null;
      }

      const userNotificationsRaw = await AsyncStorage.getItem(getNotificationUserCacheKey(userId));
      let userNotifications = null;
      try {
        userNotifications = userNotificationsRaw ? JSON.parse(userNotificationsRaw) : null;
      } catch {
        userNotifications = null;
      }

      const mergedUserNotification = cloudNotification
        ? normalizeNotificationEntry(cloudNotification)
        : normalizeNotificationEntry(userNotifications);
      const inbox = await fetchMessageInbox(userId).catch((err) => {
        console.warn('[hydrate] 拉取 messages inbox 失败:', err?.message || err);
        return normalizeInbox({ unreadCount: 0, interactions: [] });
      });

      snapshot.notifications = {
        ...normalizeNotifications(cachedNotifications),
        ...(mergedUserNotification ? {
          [userId]: {
            ...mergedUserNotification,
            unreadCount: inbox.unreadCount,
            interactions: inbox.interactions,
          },
        } : {
          [userId]: {
            unreadCount: inbox.unreadCount,
            interactions: inbox.interactions,
          },
        }),
      };
      baseDispatch({ type: 'LOAD_STATE', payload: snapshot });

      if (mergedUserNotification) {
        AsyncStorage.setItem(getNotificationUserCacheKey(userId), JSON.stringify(mergedUserNotification)).catch(() => {});
        if (!cloudNotification && userNotifications) {
          saveCloudNotificationState(userId, mergedUserNotification).catch(() => {});
        }
      }

      const currentUserSnapshot = serializeCurrentUserSnapshot(snapshot.currentUser);
      if (currentUserSnapshot) {
        AsyncStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(currentUserSnapshot)).catch(() => {});
      }
    };

    const refreshCloudNow = async (userId, tables = ['profiles', 'posts', 'plans', 'knowledge']) => {
      if (!userId) return;
      const patch = await fetchCloudPatch(tables);
      if (!active) return;

      baseDispatch({
        type: 'LOAD_STATE',
        payload: applyCloudPatch(stateRef.current, patch, userId),
      });

      const inbox = await fetchMessageInbox(userId).catch((err) => {
        console.warn('[refreshCloudNow] 拉取 messages inbox 失败:', err?.message || err);
        return null;
      });

      if (!active || !inbox) return;
      baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId, inbox } });
    };

    const restoreLocalAuthState = async () => {
      try {
        const [authRaw, userRaw] = await Promise.all([
          AsyncStorage.getItem(AUTH_CACHE_KEY),
          AsyncStorage.getItem(CURRENT_USER_CACHE_KEY),
        ]);
        const authCache = authRaw ? JSON.parse(authRaw) : null;
        const cachedUser = userRaw ? JSON.parse(userRaw) : null;
        if (!authCache?.account || !authCache?.password || !cachedUser?.id) return false;

        const currentState = createEmptyLoadedState(cachedNotifications);
        const merged = mergeCurrentUserFast(currentState, cachedUser, cachedUser);
        baseDispatch({ type: 'LOAD_STATE', payload: merged });
        return true;
      } catch {
        return false;
      }
    };

    const scheduleHydrate = (userId, tables = ['profiles', 'posts', 'plans', 'knowledge'], delay = 450) => {
      if (!userId) return;
      ensureArray(tables).forEach(table => pendingTablesRef.current.add(table));
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        const pendingTables = Array.from(pendingTablesRef.current);
        pendingTablesRef.current.clear();
        if (pendingTables.length === 0) return;

        fetchCloudPatch(pendingTables)
          .then(patch => {
            if (!active) return;
            baseDispatch({
              type: 'LOAD_STATE',
              payload: applyCloudPatch(stateRef.current, patch, userId),
            });
          })
          .catch(() => {
          if (active) {
            // 网络抖动或某个表查询失败时，保留当前登录态，避免闪回登录页
            baseDispatch({ type: 'LOAD_STATE', payload: keepCurrentUserOnSyncError(stateRef.current) });
          }
          });
      }, delay);
    };

    const shouldMuteTableSync = (table) => {
      const mutedAt = Number(localMutationMuteRef.current?.[table] || 0);
      return Date.now() - mutedAt < LOCAL_MUTATION_MUTE_MS;
    };

    const loadCloud = async () => {
      try {
        cachedNotifications = await loadCachedNotifications();
        const restoredFromSnapshot = await restoreStateSnapshot();
        const restoredLocally = restoredFromSnapshot || await restoreLocalAuthState();

        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session?.user) {
          cloudUserIdRef.current = data.session.user.id;
          await hydrate(data.session.user.id);
        } else {
          // 兜底：进程被系统杀死后如果 session 丢失，尝试使用最近一次成功登录凭据自动恢复
          const cacheRaw = await AsyncStorage.getItem(AUTH_CACHE_KEY);
          const cache = cacheRaw ? JSON.parse(cacheRaw) : null;
          const account = normalizeAccount(cache?.account);
          const password = String(cache?.password || '');

          if (account && password) {
            const signInRes = await supabase.auth.signInWithPassword({
              email: buildAuthEmail(account),
              password,
            });
            if (signInRes?.data?.user?.id) {
              cloudUserIdRef.current = signInRes.data.user.id;
              await hydrate(signInRes.data.user.id);
              return;
            }
          }

          if (!restoredLocally) {
            cloudUserIdRef.current = null;
            baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
          }
        }
      } catch {
        if (active) {
          baseDispatch({ type: 'LOAD_STATE', payload: keepCurrentUserOnSyncError(stateRef.current) });
        }
      } finally {
        if (active) {
          authBootstrappingRef.current = false;
        }
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (authBootstrappingRef.current) {
        if (session?.user) {
          cloudUserIdRef.current = session.user.id;
        }
        return;
      }

      if (session?.user) {
        cloudUserIdRef.current = session.user.id;
        scheduleHydrate(session.user.id, ['profiles', 'posts', 'plans', 'knowledge'], 0);
      } else if (active) {
        cloudUserIdRef.current = null;
          restoreLocalAuthState().then(restored => {
            if (!restored) {
              baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
            }
          }).catch(() => {
            baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
          });
      }
    });

    const channel = supabase
      .channel('friendcircle-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (shouldMuteTableSync('profiles')) return;
        scheduleHydrate(cloudUserIdRef.current, ['profiles']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        if (shouldMuteTableSync('posts')) return;
        scheduleHydrate(cloudUserIdRef.current, ['posts']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => {
        if (shouldMuteTableSync('plans')) return;
        scheduleHydrate(cloudUserIdRef.current, ['plans']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge' }, () => {
        if (shouldMuteTableSync('knowledge')) return;
        scheduleHydrate(cloudUserIdRef.current, ['knowledge']);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && cloudUserIdRef.current) {
          refreshCloudNow(cloudUserIdRef.current, ['profiles', 'posts', 'plans', 'knowledge']).catch(() => {});
        }
      });

    pollTimerRef.current = setInterval(() => {
      const userId = cloudUserIdRef.current;
      if (!userId || !active) return;
      refreshCloudNow(userId, ['posts', 'plans', 'knowledge']).catch(() => {});
    }, CLOUD_POLL_INTERVAL_MS);

    loadCloud();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') return;
      const userId = cloudUserIdRef.current;
      if (!userId) return;
      refreshCloudNow(userId, ['profiles', 'posts', 'plans', 'knowledge']).catch(() => {});
    });

    return () => {
      active = false;
      appStateSubscription.remove();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pendingTablesRef.current.clear();
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const dispatch = async (action) => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: CLOUD_CONFIG_REQUIRED_MESSAGE };
    }

    try {
      const markLocalMutation = (table) => {
        localMutationMuteRef.current[table] = Date.now();
      };

      if (action.type === 'LOGIN') {
        const account = normalizeAccount(action.payload?.account);
        const password = (action.payload?.password || '').trim();

        if (!isValidAccount(account)) {
          return { ok: false, error: '账号格式不正确，请使用 3-32 位字母、数字或 . _ -' };
        }

        if (!password) {
          return { ok: false, error: '请输入密码' };
        }

        const signInRes = await withTimeout(
          supabase.auth.signInWithPassword({
            email: buildAuthEmail(account),
            password,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          'Auth request timeout'
        );

        if (signInRes.error) return { ok: false, error: getFriendlyErrorMessage(signInRes.error, '登录失败') };

        const authUser = signInRes.data.user;
        if (authUser?.id) {
          const currentState = stateRef.current;
          const fallback = {
            id: authUser.id,
            account,
            name: currentState.users.find(u => normalizeAccount(u.account || '') === account)?.name || account,
          };

          // 登录成功后先快速进入应用，资料同步放到后台完成，减少“登录中”等待。
          baseDispatch({
            type: 'LOAD_STATE',
            payload: mergeCurrentUserFast(currentState, fallback, fallback),
          });

          const currentUserSnapshot = serializeCurrentUserSnapshot({
            ...fallback,
            bio: currentState.currentUser?.bio || '',
            avatar: currentState.currentUser?.avatar || null,
            avatarColor: currentState.currentUser?.avatarColor || pickAvatarColor(authUser.id),
            friends: currentState.currentUser?.friends || [],
            subjects: currentState.currentUser?.subjects || [...DEFAULT_SUBJECTS.slice(0, 2)],
          });
          if (currentUserSnapshot) {
            await AsyncStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(currentUserSnapshot));
          }

          supabase
            .from('profiles')
            .select('id,account,name,bio,avatar,avatar_color,friends,subjects')
            .eq('id', authUser.id)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              baseDispatch({
                type: 'LOAD_STATE',
                payload: mergeCurrentUserFast(stateRef.current, data, fallback),
              });
              const snapshot = serializeCurrentUserSnapshot({
                id: authUser.id,
                account,
                name: data.name || fallback.name,
                bio: data.bio || '',
                avatar: data.avatar || null,
                avatarColor: data.avatar_color || pickAvatarColor(authUser.id),
                friends: data.friends || [],
                subjects: data.subjects || [...DEFAULT_SUBJECTS.slice(0, 2)],
              });
              if (snapshot) {
                AsyncStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
              }
            })
            .catch(() => {});

          await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ account, password }));

          try {
            const bootstrapSnapshot = await withTimeout(
              fetchCloudState(authUser.id),
              3500,
              'bootstrap state timeout'
            );
            // fetchCloudState 已返回完整状态，不能再重复 buildCloudState，否则会把 users/currentUser 覆盖为空
            baseDispatch({ type: 'LOAD_STATE', payload: bootstrapSnapshot });
          } catch {
            // 首次同步失败时保持快速登录路径，后续由实时订阅/轮询继续补齐数据
          }
        }

        return { ok: true };
      }

      if (action.type === 'REGISTER') {
        const account = normalizeAccount(action.payload?.account);
        const password = (action.payload?.password || '').trim();
        const email = buildAuthEmail(account);

        if (!isValidAccount(account)) {
          return { ok: false, error: '账号格式不正确，请使用 3-32 位字母、数字或 . _ -' };
        }

        if (password.length < 6) {
          return { ok: false, error: '密码至少 6 位' };
        }

        const signUpRes = await supabase.auth.signUp({ email, password });
        if (signUpRes.error) {
          return { ok: false, error: getFriendlyErrorMessage(signUpRes.error, '注册失败') };
        }

        let authUserId = signUpRes.data.user?.id;
        if (!authUserId) {
          return { ok: false, error: '注册失败，未获取到云端用户信息' };
        }

        if (!signUpRes.data.session) {
          const signInRes = await supabase.auth.signInWithPassword({ email, password });
          if (signInRes.error) {
            return { ok: false, error: 'Supabase 当前开启了邮箱确认，请先关闭 Confirm email 后再注册' };
          }
          authUserId = signInRes.data.user.id;
        }

        const profile = serializeProfile({
          id: authUserId,
          account,
          name: action.payload?.name,
          bio: '',
          avatar: null,
          avatarColor: pickAvatarColor(authUserId),
          friends: [],
          subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
        });

        const { error: profileError } = await supabase.from('profiles').upsert(profile);
        if (profileError) {
          return { ok: false, error: '注册成功，但创建资料失败，请检查 Supabase 表结构' };
        }

        const currentState = stateRef.current;
        baseDispatch({
          type: 'LOAD_STATE',
          payload: mergeCurrentUserFast(currentState, {
            id: authUserId,
            account,
            name: action.payload?.name,
            bio: '',
            avatar: null,
            avatar_color: pickAvatarColor(authUserId),
            friends: [],
            subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
          }, {
            id: authUserId,
            account,
            name: action.payload?.name,
          }),
        });

        await AsyncStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(serializeCurrentUserSnapshot({
          id: authUserId,
          account,
          name: action.payload?.name,
          bio: '',
          avatar: null,
          avatarColor: pickAvatarColor(authUserId),
          friends: [],
          subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
        })));

        await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ account, password }));

        return { ok: true };
      }

      if (action.type === 'LOGOUT') {
        const userId = currentUser?.id || '';
        const { error } = await supabase.auth.signOut();
        if (error) return { ok: false, error: '退出登录失败' };
        await clearLocalSessionCache(userId);
        baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(stateRef.current.notifications) });
        return { ok: true };
      }

      if (action.type === 'DELETE_ACCOUNT') {
        const userId = currentUser?.id || '';
        if (!userId) return { ok: false, error: '请先登录' };

        let deleted = false;

        const rpcRes = await supabase.rpc('delete_my_account');
        if (!rpcRes.error) {
          deleted = true;
        } else {
          const fallbackDelete = await supabase.from('profiles').delete().eq('id', userId);
          if (!fallbackDelete.error) {
            deleted = true;
          } else {
            return { ok: false, error: `注销失败：${rpcRes.error.message || fallbackDelete.error.message || '请检查数据库函数和RLS策略'}` };
          }
        }

        const signOutRes = await supabase.auth.signOut();
        if (signOutRes.error) {
          console.warn('[DELETE_ACCOUNT] signOut failed:', signOutRes.error.message);
        }

        await clearLocalSessionCache(userId);
        baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState({}) });

        if (!deleted) {
          return { ok: false, error: '注销失败' };
        }

        return { ok: true };
      }

      if (action.type === 'MARK_NOTIFICATIONS_READ') {
        const userId = action.payload?.userId;
        if (!userId) return { ok: true };
        const inbox = await markAllMessagesRead(userId);
        const currentMap = normalizeNotifications(stateRef.current.notifications);
        const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
        const nextUserNotification = {
          ...currentUserNotification,
          commentsReadAt: action.payload?.readAt || new Date().toISOString(),
          unreadCount: inbox.unreadCount,
          interactions: inbox.interactions,
        };
        const nextMap = {
          ...currentMap,
          [userId]: nextUserNotification,
        };

        await saveCloudNotificationState(userId, nextUserNotification);
        baseDispatch({ type: 'MARK_NOTIFICATIONS_READ', payload: { userId, readAt: nextUserNotification.commentsReadAt } });
        baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId, inbox } });
        await AsyncStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(nextMap));
        await AsyncStorage.setItem(getNotificationUserCacheKey(userId), JSON.stringify(nextUserNotification));
        return { ok: true };
      }

      if (action.type === 'REFRESH_MESSAGE_INBOX') {
        const userId = action.payload?.userId || stateRef.current.currentUser?.id;
        if (!userId) return { ok: true };
        const inbox = await fetchMessageInbox(userId);
        baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId, inbox } });

        const currentMap = normalizeNotifications(stateRef.current.notifications);
        const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
        const nextUserNotification = {
          ...currentUserNotification,
          unreadCount: inbox.unreadCount,
          interactions: inbox.interactions,
        };
        const nextMap = {
          ...currentMap,
          [userId]: nextUserNotification,
        };
        await AsyncStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(nextMap));
        await AsyncStorage.setItem(getNotificationUserCacheKey(userId), JSON.stringify(nextUserNotification));
        return { ok: true, inbox };
      }

      if (action.type === 'REFRESH_CLOUD_STATE') {
        const userId = action.payload?.userId || cloudUserIdRef.current || stateRef.current.currentUser?.id;
        if (!userId) return { ok: false, error: '请先登录' };

        const [patch, cloudNotification, inbox] = await Promise.all([
          fetchCloudPatch(['profiles', 'posts', 'plans', 'knowledge']),
          fetchCloudNotificationState(userId).catch(() => null),
          fetchMessageInbox(userId).catch((err) => {
            console.warn('[REFRESH_CLOUD_STATE] 拉取 messages inbox 失败:', err?.message || err);
            return normalizeInbox({ unreadCount: 0, interactions: [] });
          }),
        ]);

        const currentMap = normalizeNotifications(stateRef.current.notifications);
        const currentNotification = normalizeNotificationEntry(currentMap[userId]);
        const mergedNotification = mergeNotificationEntries(cloudNotification, currentNotification);

        const nextUserNotification = {
          ...mergedNotification,
          unreadCount: inbox.unreadCount,
          interactions: inbox.interactions,
        };

        const nextSnapshot = applyCloudPatch(stateRef.current, patch, userId);
        nextSnapshot.notifications = {
          ...currentMap,
          [userId]: nextUserNotification,
        };

        baseDispatch({ type: 'LOAD_STATE', payload: nextSnapshot });
        await AsyncStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(nextSnapshot.notifications));
        await AsyncStorage.setItem(getNotificationUserCacheKey(userId), JSON.stringify(nextUserNotification));
        return { ok: true };
      }

      if (action.type === 'MARK_INTERACTION_READ') {
        const userId = action.payload?.userId;
        const messageId = String(action.payload?.messageId || '').trim();
        if (!userId || !messageId) return { ok: true };
        const inbox = await markOneMessageRead(userId, messageId);
        const currentMap = normalizeNotifications(stateRef.current.notifications);
        const currentUserNotification = normalizeNotificationEntry(currentMap[userId]);
        const nextReadAt = action.payload?.readAt || new Date().toISOString();
        const nextUserNotification = {
          ...currentUserNotification,
          commentsReadAt: pickLatestTimestamp(currentUserNotification.commentsReadAt, nextReadAt),
          unreadCount: inbox.unreadCount,
          interactions: inbox.interactions,
        };
        const nextMap = {
          ...currentMap,
          [userId]: nextUserNotification,
        };

        await saveCloudNotificationState(userId, nextUserNotification);
        baseDispatch({ type: 'MARK_INTERACTION_READ', payload: { userId, interactionKey: messageId, readAt: nextReadAt } });
        baseDispatch({ type: 'SET_MESSAGE_INBOX', payload: { userId, inbox } });
        await AsyncStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(nextMap));
        await AsyncStorage.setItem(getNotificationUserCacheKey(userId), JSON.stringify(nextUserNotification));
        return { ok: true };
      }

      const currentState = stateRef.current;
      const currentUser = currentState.currentUser;
      if (!currentUser) {
        return { ok: false, error: '请先登录' };
      }

      if (action.type === 'UPDATE_PROFILE') {
        markLocalMutation('profiles');
        let avatar = action.payload?.avatar ?? currentUser.avatar ?? null;
        if (avatar && !isRemoteAsset(avatar)) {
          avatar = await uploadAssetIfNeeded(currentUser.id, avatar, 'profiles/avatars');
        }
        const { error } = await supabase.from('profiles').update({
          name: action.payload?.name?.trim() || currentUser.name,
          bio: action.payload?.bio?.trim() || '',
          avatar,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '资料保存失败' };

        baseDispatch({
          type: 'UPDATE_PROFILE',
          payload: {
            ...action.payload,
            avatar,
          },
        });
        AsyncStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(serializeCurrentUserSnapshot({
          ...currentUser,
          name: action.payload?.name?.trim() || currentUser.name,
          bio: action.payload?.bio?.trim() || '',
          avatar,
        }))).catch(() => {});
        return { ok: true };
      } else if (action.type === 'ADD_FRIEND' || action.type === 'REMOVE_FRIEND') {
        markLocalMutation('profiles');
        const targetUserId = action.payload;
        const targetUser = currentState.users.find(user => user.id === targetUserId);
        if (!targetUser) return { ok: false, error: '未找到该用户' };

        const nextCurrentFriends = action.type === 'ADD_FRIEND'
          ? toUniqueStrings([...(currentUser.friends || []), targetUserId])
          : (currentUser.friends || []).filter(id => id !== targetUserId);
        const nextTargetFriends = action.type === 'ADD_FRIEND'
          ? toUniqueStrings([...(targetUser.friends || []), currentUser.id])
          : (targetUser.friends || []).filter(id => id !== currentUser.id);

        const [currentUpdate, targetUpdate] = await Promise.all([
          supabase.from('profiles').update({ friends: nextCurrentFriends, updated_at: new Date().toISOString() }).eq('id', currentUser.id),
          supabase.from('profiles').update({ friends: nextTargetFriends, updated_at: new Date().toISOString() }).eq('id', targetUserId),
        ]);
        if (currentUpdate.error || targetUpdate.error) {
          return { ok: false, error: '好友关系更新失败' };
        }
      } else if (action.type === 'ADD_SUBJECT') {
        markLocalMutation('profiles');
        const subject = action.payload?.trim();
        const nextSubjects = toUniqueStrings([...(currentUser.subjects || []), subject]);
        const { error } = await supabase.from('profiles').update({
          subjects: nextSubjects,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '新增学科失败' };
      } else if (action.type === 'REMOVE_SUBJECT') {
        markLocalMutation('profiles');
        const subject = action.payload?.trim();
        const currentSubjects = currentUser.subjects || [];
        if (currentSubjects.length <= 1) {
          return { ok: false, error: '至少保留一个学科' };
        }
        const nextSubjects = currentSubjects.filter(item => item !== subject);
        const { error } = await supabase.from('profiles').update({
          subjects: nextSubjects,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '删除学科失败' };
      } else if (action.type === 'ADD_POST') {
        markLocalMutation('posts');
        const draft = normalizePost(action.payload);
        const hasMedia = (draft.images || []).length > 0 || (draft.videos || []).length > 0;

        if (hasMedia) {
          const optimistic = normalizePost({
            ...draft,
            uploadStatus: 'uploading',
            uploadError: '',
          });

          baseDispatch({ type: 'ADD_POST', payload: optimistic });

          (async () => {
            try {
              const uploaded = await preparePostPayload(currentUser.id, draft);
              const { error } = await supabase.from('posts').insert(serializePost(uploaded));
              if (error) throw error;

              baseDispatch({
                type: 'PATCH_POST_LOCAL',
                payload: {
                  postId: optimistic.id,
                  changes: {
                    ...uploaded,
                    uploadStatus: 'done',
                    uploadError: '',
                  },
                },
              });
            } catch (error) {
              baseDispatch({
                type: 'PATCH_POST_LOCAL',
                payload: {
                  postId: optimistic.id,
                  changes: {
                    uploadStatus: 'failed',
                    uploadError: getFriendlyErrorMessage(error, '上传失败，请重试或删除后重发'),
                  },
                },
              });
            }
          })();

          return { ok: true, async: true };
        }

        const payload = await preparePostPayload(currentUser.id, draft);
        const { error } = await supabase.from('posts').insert(serializePost(payload));
        if (error) return { ok: false, error: '发布动态失败' };
        baseDispatch({ type: 'ADD_POST', payload: { ...payload, uploadStatus: 'done' } });
        return { ok: true };
      } else if (action.type === 'DELETE_POST') {
        markLocalMutation('posts');
        const { error } = await supabase.from('posts').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除动态失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_POST') {
        markLocalMutation('posts');
        const post = currentState.posts.find(item => item.id === action.payload?.postId);
        if (!post) return { ok: false, error: '动态不存在' };
        const liked = (post.likes || []).includes(action.payload?.userId);
        const nextLikes = liked
          ? (post.likes || []).filter(id => id !== action.payload?.userId)
          : [...(post.likes || []), action.payload?.userId];
        const { error } = await supabase.from('posts').update({ likes: nextLikes }).eq('id', post.id);
        if (error) return { ok: false, error: '点赞失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'ADD_COMMENT' || action.type === 'DELETE_COMMENT') {
        markLocalMutation('posts');
        const postId = action.payload?.postId;
        const post = currentState.posts.find(item => item.id === postId);
        if (!post) return { ok: false, error: '动态不存在' };
        const optimisticComment = action.type === 'ADD_COMMENT' ? normalizeComment(action.payload?.comment) : null;
        let latestComments = post.comments || [];
        const latestRes = await supabase.from('posts').select('comments').eq('id', postId).maybeSingle();
        if (!latestRes.error && Array.isArray(latestRes.data?.comments)) {
          latestComments = latestRes.data.comments.map(normalizeComment);
        }
        const nextComments = action.type === 'ADD_COMMENT'
          ? [...latestComments, optimisticComment]
          : latestComments.filter(comment => comment.id !== action.payload?.commentId);

        if (action.type === 'ADD_COMMENT') {
          baseDispatch({
            type: 'ADD_COMMENT',
            payload: {
              postId,
              comment: optimisticComment,
            },
          });
        }

        let updateError = null;

        if (action.type === 'ADD_COMMENT' && optimisticComment) {
          const rpcRes = await supabase.rpc('append_post_comment', {
            p_post_id: postId,
            p_comment: optimisticComment,
          });

          if (rpcRes.error && !isRpcMissing(rpcRes.error, 'append_post_comment')) {
            updateError = rpcRes.error;
          }

          if (isRpcMissing(rpcRes.error, 'append_post_comment')) {
            const firstUpdateRes = await supabase.from('posts').update({ comments: nextComments }).eq('id', postId);
            updateError = firstUpdateRes.error || null;
          }
        } else {
          const firstUpdateRes = await supabase.from('posts').update({ comments: nextComments }).eq('id', postId);
          updateError = firstUpdateRes.error || null;
        }

        // 并发评论时再拉一次最新评论重试，减少“发送后立刻回滚”
        if (updateError && action.type === 'ADD_COMMENT' && optimisticComment) {
          const retryLatestRes = await supabase.from('posts').select('comments').eq('id', postId).maybeSingle();
          const retryLatestComments = !retryLatestRes.error && Array.isArray(retryLatestRes.data?.comments)
            ? retryLatestRes.data.comments.map(normalizeComment)
            : latestComments;
          const retryComments = mergeCommentsById([...retryLatestComments, optimisticComment], []);
          const secondRpcRes = await supabase.rpc('append_post_comment', {
            p_post_id: postId,
            p_comment: optimisticComment,
          });

          if (!secondRpcRes.error) {
            updateError = null;
          } else if (isRpcMissing(secondRpcRes.error, 'append_post_comment')) {
            const secondUpdateRes = await supabase.from('posts').update({ comments: retryComments }).eq('id', postId);
            updateError = secondUpdateRes.error || null;
          } else {
            updateError = secondRpcRes.error;
          }
        }

        if (updateError) {
          if (action.type === 'ADD_COMMENT' && optimisticComment?.id) {
            baseDispatch({ type: 'DELETE_COMMENT', payload: { postId, commentId: optimisticComment.id } });
          }
          return { ok: false, error: getFriendlyErrorMessage(updateError, '评论发送失败，请稍后重试') };
        }

        if (action.type === 'DELETE_COMMENT') {
          baseDispatch(action);
        }

        if (action.type === 'ADD_COMMENT' && optimisticComment && post.userId !== currentUser.id) {
          try {
            await upsertInteractionMessage({
              userId: post.userId,
              actorId: currentUser.id,
              sourceType: 'post',
              sourceId: postId,
              sourcePreview: post.text,
              content: optimisticComment.text,
              sourceCommentId: optimisticComment.id,
            });
          } catch (messageError) {
            console.warn('[ADD_COMMENT] 写入 messages 失败:', messageError?.message || messageError);
          }
        }

        return { ok: true };
      } else if (action.type === 'ADD_PLAN') {
        markLocalMutation('plans');
        const { error } = await supabase.from('plans').insert(serializePlan(action.payload));
        if (error) return { ok: false, error: '发布规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'DELETE_PLAN') {
        markLocalMutation('plans');
        const { error } = await supabase.from('plans').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'TOGGLE_PLAN_TASK' || action.type === 'UPDATE_PLAN' || action.type === 'TOGGLE_PLAN_DONE') {
        markLocalMutation('plans');
        const planId = action.type === 'TOGGLE_PLAN_TASK'
          ? action.payload?.planId
          : action.type === 'TOGGLE_PLAN_DONE'
            ? action.payload?.planId
            : action.payload?.id;
        const plan = currentState.plans.find(item => item.id === planId);
        if (!plan) return { ok: false, error: '规划不存在' };
        const mergedPlan = action.type === 'TOGGLE_PLAN_TASK'
          ? {
              ...plan,
              tasks: (plan.tasks || []).map(task =>
                task.id === action.payload?.taskId ? { ...task, done: !task.done } : task
              ),
            }
          : action.type === 'TOGGLE_PLAN_DONE'
            ? { ...plan, done: !plan.done }
          : { ...plan, ...action.payload };
        if (action.type === 'TOGGLE_PLAN_DONE') {
          baseDispatch(action);
        }
        const { error } = await supabase.from('plans').update(serializePlan(mergedPlan)).eq('id', planId);
        if (error) return { ok: false, error: '规划更新失败' };
        if (action.type !== 'TOGGLE_PLAN_DONE') {
          baseDispatch(action);
        }
        return { ok: true };
      } else if (action.type === 'ADD_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const payload = await prepareKnowledgePayload(currentUser.id, action.payload);
        const { error } = await supabase.from('knowledge').insert(serializeKnowledge(payload));
        if (error) return { ok: false, error: '保存错题失败' };
        baseDispatch({ type: 'ADD_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'UPDATE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const existing = currentState.knowledge.find(item => item.id === action.payload?.id);
        if (!existing) return { ok: false, error: '错题不存在' };
        const payload = await prepareKnowledgePayload(currentUser.id, { ...existing, ...action.payload });
        const { error } = await supabase.from('knowledge').update(serializeKnowledge(payload)).eq('id', payload.id);
        if (error) return { ok: false, error: '更新错题失败' };
        baseDispatch({ type: 'UPDATE_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'DELETE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const { error } = await supabase.from('knowledge').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除错题失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const item = currentState.knowledge.find(knowledge => knowledge.id === action.payload?.knowledgeId);
        if (!item) return { ok: false, error: '错题不存在' };
        const liked = (item.likes || []).includes(action.payload?.userId);
        const nextLikes = liked
          ? (item.likes || []).filter(id => id !== action.payload?.userId)
          : [...(item.likes || []), action.payload?.userId];
        const { error } = await supabase.from('knowledge').update({ likes: nextLikes }).eq('id', item.id);
        if (error) return { ok: false, error: '点赞失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'ADD_KNOWLEDGE_COMMENT') {
        markLocalMutation('knowledge');
        const item = currentState.knowledge.find(knowledge => knowledge.id === action.payload?.knowledgeId);
        if (!item) return { ok: false, error: '错题不存在' };
        const uploadedComment = normalizeComment({
          ...action.payload?.comment,
          images: await uploadAssetList(currentUser.id, action.payload?.comment?.images, 'knowledge/comment-images'),
          audioFiles: await uploadAudioFiles(currentUser.id, action.payload?.comment?.audioFiles, 'knowledge/comment-audio'),
        });
        let latestComments = item.comments || [];
        const latestRes = await supabase.from('knowledge').select('comments').eq('id', item.id).maybeSingle();
        if (!latestRes.error && Array.isArray(latestRes.data?.comments)) {
          latestComments = latestRes.data.comments.map(normalizeComment);
        }
        const nextComments = [...latestComments, uploadedComment];

        baseDispatch({
          type: 'ADD_KNOWLEDGE_COMMENT',
          payload: {
            knowledgeId: item.id,
            comment: uploadedComment,
          },
        });

        let updateError = null;
        const firstRpcRes = await supabase.rpc('append_knowledge_comment', {
          p_knowledge_id: item.id,
          p_comment: uploadedComment,
        });

        if (firstRpcRes.error && !isRpcMissing(firstRpcRes.error, 'append_knowledge_comment')) {
          updateError = firstRpcRes.error;
        }

        if (isRpcMissing(firstRpcRes.error, 'append_knowledge_comment')) {
          const firstUpdateRes = await supabase.from('knowledge').update({ comments: nextComments }).eq('id', item.id);
          updateError = firstUpdateRes.error || null;
        }

        if (updateError && uploadedComment?.id) {
          const retryLatestRes = await supabase.from('knowledge').select('comments').eq('id', item.id).maybeSingle();
          const retryLatestComments = !retryLatestRes.error && Array.isArray(retryLatestRes.data?.comments)
            ? retryLatestRes.data.comments.map(normalizeComment)
            : latestComments;
          const retryComments = mergeCommentsById([...retryLatestComments, uploadedComment], []);
          const secondRpcRes = await supabase.rpc('append_knowledge_comment', {
            p_knowledge_id: item.id,
            p_comment: uploadedComment,
          });

          if (!secondRpcRes.error) {
            updateError = null;
          } else if (isRpcMissing(secondRpcRes.error, 'append_knowledge_comment')) {
            const secondUpdateRes = await supabase.from('knowledge').update({ comments: retryComments }).eq('id', item.id);
            updateError = secondUpdateRes.error || null;
          } else {
            updateError = secondRpcRes.error;
          }
        }

        if (updateError) {
          baseDispatch({ type: 'DELETE_KNOWLEDGE_COMMENT', payload: { knowledgeId: item.id, commentId: uploadedComment.id } });
          return { ok: false, error: getFriendlyErrorMessage(updateError, '评论发送失败，请稍后重试') };
        }

        if (item.userId !== currentUser.id) {
          try {
            await upsertInteractionMessage({
              userId: item.userId,
              actorId: currentUser.id,
              sourceType: 'knowledge',
              sourceId: item.id,
              sourcePreview: item.question,
              content: uploadedComment.text,
              sourceCommentId: uploadedComment.id,
            });
          } catch (messageError) {
            console.warn('[ADD_KNOWLEDGE_COMMENT] 写入 messages 失败:', messageError?.message || messageError);
          }
        }

        return { ok: true };
      } else {
        baseDispatch(action);
        return { ok: true };
      }

      if (['ADD_FRIEND', 'REMOVE_FRIEND', 'ADD_SUBJECT', 'REMOVE_SUBJECT'].includes(action.type)) {
        baseDispatch(action);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getFriendlyErrorMessage(error, error?.message || '云端同步失败，请检查 Supabase 配置') };
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch, isCloudEnabled: isSupabaseConfigured }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
