/**
 * Shared MCP Server — used by both Node.js (index.ts) and CF Worker (worker.ts)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TelegramClient } from './client.js';
import { TOOLS } from './tools.js';

export interface TelegramMcpConfig {
  botToken: string;
}

export function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: TelegramClient
) {
  switch (toolName) {
    // ========== Bot Info ==========
    case 'tg_get_me':
      return client.getMe();
    case 'tg_set_my_commands':
      return client.setMyCommands(
        args.commands as Array<{ command: string; description: string }>,
        args.scope as Record<string, unknown> | undefined,
        args.language_code as string | undefined
      );

    // ========== Send Messages ==========
    case 'tg_send_message': {
      const { chat_id, text, ...opts } = args;
      return client.sendMessage(chat_id as string, text as string, opts);
    }
    case 'tg_send_photo': {
      const { chat_id, photo, ...opts } = args;
      return client.sendPhoto(chat_id as string, photo as string, opts);
    }
    case 'tg_send_document': {
      const { chat_id, document, ...opts } = args;
      return client.sendDocument(chat_id as string, document as string, opts);
    }
    case 'tg_send_video': {
      const { chat_id, video, ...opts } = args;
      return client.sendVideo(chat_id as string, video as string, opts);
    }
    case 'tg_send_audio': {
      const { chat_id, audio, ...opts } = args;
      return client.sendAudio(chat_id as string, audio as string, opts);
    }
    case 'tg_send_location': {
      const { chat_id, latitude, longitude, ...opts } = args;
      return client.sendLocation(chat_id as string, latitude as number, longitude as number, opts);
    }
    case 'tg_send_poll': {
      const { chat_id, question, options, ...opts } = args;
      return client.sendPoll(chat_id as string, question as string, options as string[], opts);
    }
    case 'tg_send_contact': {
      const { chat_id, phone_number, first_name, ...opts } = args;
      return client.sendContact(chat_id as string, phone_number as string, first_name as string, opts);
    }

    // ========== Edit/Delete Messages ==========
    case 'tg_edit_message_text': {
      const { chat_id, message_id, text, ...opts } = args;
      return client.editMessageText(chat_id as string, message_id as number, text as string, opts);
    }
    case 'tg_edit_message_caption': {
      const { chat_id, message_id, ...opts } = args;
      return client.editMessageCaption(chat_id as string, message_id as number, opts);
    }
    case 'tg_delete_message':
      return client.deleteMessage(args.chat_id as string, args.message_id as number);

    // ========== Chat Management ==========
    case 'tg_get_chat':
      return client.getChat(args.chat_id as string);
    case 'tg_get_chat_member_count':
      return client.getChatMemberCount(args.chat_id as string);
    case 'tg_get_chat_member':
      return client.getChatMember(args.chat_id as string, args.user_id as number);
    case 'tg_ban_chat_member': {
      const { chat_id, user_id, ...opts } = args;
      return client.banChatMember(chat_id as string, user_id as number, opts);
    }
    case 'tg_unban_chat_member': {
      const { chat_id, user_id, ...opts } = args;
      return client.unbanChatMember(chat_id as string, user_id as number, opts);
    }

    // ========== Webhooks ==========
    case 'tg_set_webhook': {
      const { url, ...opts } = args;
      return client.setWebhook(url as string, opts);
    }
    case 'tg_delete_webhook':
      return client.deleteWebhook(
        args.drop_pending_updates !== undefined
          ? { drop_pending_updates: args.drop_pending_updates }
          : undefined
      );
    case 'tg_get_webhook_info':
      return client.getWebhookInfo();

    // ========== Callbacks & Files ==========
    case 'tg_answer_callback_query': {
      const { callback_query_id, ...opts } = args;
      return client.answerCallbackQuery(callback_query_id as string, opts);
    }
    case 'tg_get_file':
      return client.getFile(args.file_id as string);
    case 'tg_get_user_profile_photos': {
      const { user_id, ...opts } = args;
      return client.getUserProfilePhotos(user_id as number, opts);
    }

    // ========== Pins & Invite Links ==========
    case 'tg_pin_chat_message': {
      const { chat_id, message_id, ...opts } = args;
      return client.pinChatMessage(chat_id as string, message_id as number, opts);
    }
    case 'tg_unpin_chat_message':
      return client.unpinChatMessage(args.chat_id as string, args.message_id as number | undefined);
    case 'tg_create_chat_invite_link': {
      const { chat_id, ...opts } = args;
      return client.createChatInviteLink(chat_id as string, opts);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function createServer(config?: TelegramMcpConfig) {
  const server = new McpServer({
    name: 'telegram-bot-mcp',
    version: '1.0.2',
  });

  let client: TelegramClient | null = null;

  // Register all 27 tools with annotations
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as any,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        const botToken =
          config?.botToken ||
          (args as Record<string, unknown>).TELEGRAM_BOT_TOKEN as string;

        if (!botToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: TELEGRAM_BOT_TOKEN is required' }],
            isError: true,
          };
        }

        if (!client || config?.botToken !== botToken) {
          client = new TelegramClient({ botToken });
        }

        try {
          const result = await handleToolCall(tool.name, args, client);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    );
  }

  // Register prompts
  server.prompt(
    'send-messages',
    'Guide for sending different types of messages via Telegram bot',
    async () => {
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'You are a Telegram bot assistant. Help me send messages through my bot.',
              '',
              'Available message types:',
              '1. **Text** — Use tg_send_message with chat_id and text (supports MarkdownV2/HTML)',
              '2. **Photo** — Use tg_send_photo with chat_id and photo URL',
              '3. **Document** — Use tg_send_document with chat_id and document URL',
              '4. **Video** — Use tg_send_video with chat_id and video URL',
              '5. **Audio** — Use tg_send_audio with chat_id and audio URL',
              '6. **Location** — Use tg_send_location with chat_id, latitude, longitude',
              '7. **Poll** — Use tg_send_poll with chat_id, question, options',
              '8. **Contact** — Use tg_send_contact with chat_id, phone_number, first_name',
              '',
              'Start by getting my bot info with tg_get_me.',
            ].join('\n'),
          },
        }],
      };
    },
  );

  server.prompt(
    'manage-chat',
    'Guide for managing Telegram chats, members, and webhooks',
    async () => {
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'You are a Telegram chat management assistant.',
              '',
              'Available actions:',
              '1. **Get chat info** — Use tg_get_chat for chat details',
              '2. **Member count** — Use tg_get_chat_member_count',
              '3. **Check member** — Use tg_get_chat_member for member status',
              '4. **Ban/Unban** — Use tg_ban_chat_member, tg_unban_chat_member',
              '5. **Webhooks** — Use tg_set_webhook, tg_delete_webhook, tg_get_webhook_info',
              '6. **Pin messages** — Use tg_pin_chat_message, tg_unpin_chat_message',
              '7. **Invite links** — Use tg_create_chat_invite_link',
              '',
              'What would you like to manage?',
            ].join('\n'),
          },
        }],
      };
    },
  );

  // Register resources
  server.resource(
    'server-info',
    'telegram://server-info',
    {
      description: 'Connection status and available tools for this Telegram MCP server',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [{
          uri: 'telegram://server-info',
          mimeType: 'application/json',
          text: JSON.stringify({
            name: 'telegram-bot-mcp',
            version: '1.0.2',
            connected: !!config,
            tools_available: TOOLS.length,
            tool_categories: {
              bot_info: 2,
              send_messages: 8,
              edit_messages: 3,
              chat_management: 5,
              webhooks: 3,
              callbacks_and_files: 3,
              pins_and_invites: 3,
            },
          }, null, 2),
        }],
      };
    },
  );

  return server;
}
