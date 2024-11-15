import { Attachment } from 'discord.js'
import {
  ICredentialsDecrypted,
  ICredentialTestFunctions,
  IExecuteFunctions,
  INodeCredentialTestResult,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  IWebhookFunctions,
  IWebhookResponseData,
  JsonObject,
  NodeConnectionType,
} from 'n8n-workflow'
import ipc from 'node-ipc'

import {
  connection,
  execution,
  getChannels as getChannelsHelper,
  getRoles as getRolesHelper,
  ICredentials,
} from './bot/helpers'
import { options } from './DiscordTrigger.node.options'

const nodeDescription: INodeTypeDescription = {
  displayName: 'Discord Trigger',
  name: 'discordTrigger',
  icon: 'file:discord.svg',
  group: ['trigger', 'discord'],
  version: 1,
  subtitle: '',
  description: 'Trigger based on Discord events',
  eventTriggerDescription: '',
  mockManualExecution: true,
  activationMessage: 'Your workflow will now trigger executions on the event you have defined.',
  defaults: {
    name: 'Discord Trigger',
  },
  // nodelinter-ignore-next-line WRONG_NUMBER_OF_INPUTS_IN_REGULAR_NODE_DESCRIPTION
  inputs: [],
  outputs: [NodeConnectionType.Main],
  credentials: [
    {
      name: 'discordApi',
      required: true,
      testedBy: 'discordApiTest',
    },
  ],
  webhooks: [
    {
      name: 'default',
      httpMethod: 'POST',
      responseMode: 'onReceived',
      path: 'webhook',
    },
  ],
  properties: options,
}

export class DiscordTrigger implements INodeType {
  description: INodeTypeDescription = nodeDescription

  methods = {
    credentialTest: {
      discordApiTest,
    },
    loadOptions: {
      async getChannels(): Promise<INodePropertyOptions[]> {
        return await getChannelsHelper(this).catch((e) => e)
      },
      async getRoles(): Promise<INodePropertyOptions[]> {
        return await getRolesHelper(this).catch((e) => e)
      },
    },
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject()

    return {
      workflowData: [this.helpers.returnJsonArray(req.body)],
    }
  }

  async trigger(this: ITriggerFunctions): Promise<undefined> {
    const activationMode = this.getActivationMode() as 'activate' | 'update' | 'init' | 'manual'
    if (activationMode !== 'manual') {
      let baseUrl = ''

      const credentials = (await this.getCredentials('discordApi').catch((e) => e)) as any as ICredentials
      await connection(credentials).catch((e) => e)

      try {
        const regex = /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^/\n?]+)/gim
        let match
        while ((match = regex.exec(credentials.baseUrl)) != null) {
          baseUrl = match[0]
        }
      } catch (e) {
        console.log(e)
      }

      ipc.connectTo('bot', () => {
        const { webhookId } = this.getNode()

        const parameters: any = {}
        Object.keys(this.getNode().parameters).forEach((key) => {
          parameters[key] = this.getNodeParameter(key, '') as any
        })

        ipc.of.bot.emit('trigger', {
          ...parameters,
          baseUrl,
          webhookId,
          active: this.getWorkflow().active,
          credentials,
        })
      })
    }
    return
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const executionId = this.getExecutionId()
    const input = this.getInputData()
    const credentials = (await this.getCredentials('discordApi')) as any as ICredentials
    const guild = input[0].json?.guild
    const placeholderId = input[0].json?.placeholderId as string
    const channelId = input[0].json?.channelId as string
    const userId = input[0].json?.userId as string
    const userName = input[0].json?.userName as string
    const userTag = input[0].json?.userTag as string
    const messageId = input[0].json?.messageId as string
    const content = input[0].json?.content as string
    const presence = input[0].json?.presence as string
    const nick = input[0].json?.nick as string
    const addedRoles = input[0].json?.addedRoles as string
    const removedRoles = input[0].json?.removedRoles as string
    const interactionMessageId = input[0].json?.interactionMessageId as string
    const interactionValues = input[0].json?.interactionValues as string[]
    const userRoles = input[0].json?.userRoles as string[]
    const attachments = input[0].json?.attachments as Attachment[]

    await execution(executionId, placeholderId, channelId, credentials.apiKey, credentials.baseUrl, userId).catch(
      (e) => e,
    )
    const returnData: INodeExecutionData[] = []
    returnData.push({
      json: {
        content,
        guild,
        channelId,
        userId,
        userName,
        userTag,
        messageId,
        presence,
        nick,
        addedRoles,
        removedRoles,
        interactionMessageId,
        interactionValues,
        userRoles,
        ...(attachments?.length ? { attachments } : {}),
      },
    })
    return this.prepareOutputData(returnData)
  }
}

async function discordApiTest(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  const requestOptions = {
    method: 'GET',
    uri: 'https://discord.com/api/v10/oauth2/@me',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'DiscordBot (https://www.discord.com, 1)',
      Authorization: `Bot ${credential.data?.token}`,
    },
    json: true,
  }

  try {
    await this.helpers.request(requestOptions)
  } catch (error) {
    return {
      status: 'Error',
      message: `Connection details not valid: ${(error as JsonObject).message}`,
    }
  }
  return {
    status: 'OK',
    message: 'Authentication successful!',
  }
}
