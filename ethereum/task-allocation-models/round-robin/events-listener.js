const { CronJob, CronTime } = require('cron')
const { web3 } = require('../../web3')
const { timestampToDate, timestampToHour } = require('../../web3-utils')
const { hexToAscii } = web3.utils

const { getRRContract } = require('./round-robin')
const rrContract = getRRContract()

const USER_REGISTERED = 'UserRegistered'
const TASK_ALLOCATED = 'TaskAllocated'
const TASK_ACCEPTED = 'TaskAccepted'
const TASK_REJECTED = 'TaskRejected'

const cronJobs = new Map()

async function userRegistered(err, { returnValues: { userId } }) {
  if (err) console.error(err)
  else {
    console.log(
      `UserRegistered event received: User ${hexToAscii(userId)} registered`
    )
  }
}

async function taskAllocated(err, { returnValues: { taskId, userId } }) {
  if (err) console.error(err)
  else {
    const reallocationTime = await rrContract.methods.getTask(taskId).call()
    console.log(
      `TaskAllocated event received: Task ${hexToAscii(
        taskId
      )} has been assigned to ${hexToAscii(
        userId
      )} and will be reasigned on ${timestampToHour(reallocationTime)}`
    )

    let cronJob
    if (cronJobs.has(taskId)) {
      cronJob = cronJobs.get(taskId)
      cronJob.setTime(new CronTime(timestampToDate(reallocationTime)))
    } else {
      cronJob = createReallocationCronJob(taskId, reallocationTime)
      cronJobs.set(taskId, cronJob)
    }
    cronJob.start()
  }
}

async function taskRejected(err, { returnValues: { taskId, userId } }) {
  if (err) console.error(err)
  else {
    console.log(
      `TaskRejected event received: Task ${hexToAscii(
        taskId
      )} has been rejected by ${hexToAscii(userId)}`
    )
  }
}

function taskAccepted(err, event) {
  const { taskId, userId } = event.returnValues
  if (err) console.error(err)
  else {
    console.log(
      `TaskAccepted event received: Task ${hexToAscii(
        taskId
      )} has been accepted by ${hexToAscii(userId)}`
    )
    cronJobs.get(taskId).stop()
  }
}

function createReallocationCronJob(taskId, timestamp) {
  const executionDate = timestampToDate(timestamp)
  return new CronJob(executionDate, function () {
    console.log(
      `Executing job with task id: ${hexToAscii(taskId)} on ${executionDate}`
    )
    rrContract.methods
      .reallocateTask(taskId)
      .send()
      .then(
        () => {},
        err => {
          console.error(`Error trying to reallocate task ${taskId}`)
          console.error(err.data)
        }
      )
  })
}

exports.setUpEventListeners = () => {
  rrContract.events[USER_REGISTERED]({}, userRegistered)
  rrContract.events[TASK_ALLOCATED]({}, taskAllocated)
  rrContract.events[TASK_ACCEPTED]({}, taskAccepted)
  rrContract.events[TASK_REJECTED]({}, taskRejected)
}
