/* eslint-disable  func-names */
/* eslint-disable  no-console */
"use strict";

const {
  TextAnalyticsClient,
  AzureKeyCredential,
} = require("@azure/ai-text-analytics");

const key = process.env.AZUREKEY;
const endpoint = process.env.AZUREENDPOINT;

const Alexa = require("ask-sdk");
const axios = require("axios");
const persistenceAdapter = require("ask-sdk-s3-persistence-adapter");

const releaseVersion = "1.0.0";

const MAXATTEMPTS = 3;
const sentiments = ["positive", "negative", "neutral"];

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === "LaunchRequest";
  },
  async handle(handlerInput) {
    console.log("VERSION: ", releaseVersion);
    console.log("USER -> ", handlerInput.requestEnvelope.context.System.user);
    console.log(
      "DEVICE -> ",
      handlerInput.requestEnvelope.context.System.device
    );
    //console.log("VERSION: ", process.env);

    const responseBuilder = handlerInput.responseBuilder;
    var attributes = handlerInput.attributesManager.getSessionAttributes();
    const APLsupport = supportsAPL(handlerInput);

    let say =
      "In Sentiment Blue you will try to match Microsoft Azure's sentiment measurements to specific goals, by making positive, negative or neutral statements. The clocer you match the goals, the higher your score. You may not always agree with Azure's measurements. That's OK! The challenge is to try to match as best you can. Say, practice, or, start game, to begin.";
    attributes.gameScore = 0;
    attributes.level = 1;
    attributes.attempt = 0;
    attributes.sentimentIdx = 0;
    attributes.passed = [false, false, false];
    attributes.phase = "waiting";
    attributes.lastSay = "";
    attributes.retryOffered = false;
    attributes.retryTaken = false;
    attributes.retryPenalty = 1.0;
    attributes.Level1round = 1;
    attributes.Level2round = 1;

    var d = new Date().toISOString();
    var cardText =
      d +
      " v" +
      releaseVersion +
      ":\nIn Sentiment Blue you will try to match Microsft Azure's sentiment measurements to specific goals, by making positive, negative or neutral statements. The closer you match the goals, the higher your score. You may not always agree with Microsoft's measurements. That's OK! The challenge is to try to match as best you can.\n\n";
    var pSessionAttributes;
    try {
      pSessionAttributes =
        (await handlerInput.attributesManager.getPersistentAttributes()) || {};
    } catch (err) {
      // console.log("Getting Persistent Attributers: ", err);
      pSessionAttributes = {};
    }
    if (
      pSessionAttributes.hasOwnProperty("hiScore") &&
      pSessionAttributes.hiScore > 0
    ) {
      say =
        "Welcome back. Your previous high score was " +
        pSessionAttributes.hiScore +
        ". Say, start game, to see if you can beat it, or say, practice, for more practice.";
      attributes.hiScore = pSessionAttributes.hiScore;
      cardText += "\n\nPrevious high score: " + pSessionAttributes.hiScore;
    } else attributes.hiScore = 0;
    handlerInput.attributesManager.setSessionAttributes(attributes);
    let skillTitle = "SENTIMENT BLUE";
    if (APLsupport) {
      //DISPLAY_SHAPE = handlerInput.requestEnvelope.context.Viewport.shape;
      const myDoc = require("./launchRequest.json");
      return handlerInput.responseBuilder
        .speak(say)
        .withSimpleCard("Sentiment Blue", cardText)
        .addDirective({
          type: "Alexa.Presentation.APL.RenderDocument",
          token: "launchToken",
          document: myDoc,
        })
        .reprompt("Say, practice, or, start game, to begin.")
        .getResponse();
    } else {
      // JUST AUDIO
      return (
        handlerInput.responseBuilder
          .speak(say)
          .withSimpleCard("Sentiment Blue", cardText)
          //.withShouldEndSession(true)
          .reprompt("Say, practice, or, start game, to begin.")
          .getResponse()
      );
    }
  },
};

const PracticeIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "PracticeIntent"
    );
  },

  handle(handlerInput) {
    var practiceSentiment = "all";

    if (handlerInput.requestEnvelope.request.intent.slots.sentiment) {
      let statedSentiment =
        handlerInput.requestEnvelope.request.intent.slots.sentiment.value;
      if (["positive", "neutral", "negative"].includes(statedSentiment))
        practiceSentiment = statedSentiment;
      else practiceSentiment = "all";
    }

    var attributes = handlerInput.attributesManager.getSessionAttributes();
    const APLsupport = supportsAPL(handlerInput);
    attributes.gameScore = 0;
    attributes.level = 0;
    attributes.attempt = 0;
    attributes.sentimentIdx = 0;

    attributes.sentimentIdx =
      practiceSentiment == "all" ? 0 : sentiments.indexOf(practiceSentiment);

    attributes.passed = [false, false];
    attributes.phase = "practice";
    attributes.practiceMode = practiceSentiment;

    attributes.lastSay = ` In one or two sentences, tell me something ${
      practiceSentiment == "all" ? "POSITIVE" : practiceSentiment.toUpperCase()
    }.`;
    let say = `Starting practice. To end practice and begin a new game, say, start game. In one or two sentences, tell me something ${
      practiceSentiment == "all" ? "POSITIVE" : practiceSentiment.toUpperCase()
    }.`;

    /* build an APL screen for this */

    if (APLsupport) {
      const myDoc = require("./roundCard.json");
      return handlerInput.responseBuilder
        .speak(say)
        .addDirective({
          type: "Alexa.Presentation.APL.RenderDocument",
          token: "roundToken",
          document: myDoc,
          datasources: {
            roundData: {
              type: "object",
              properties: {
                level: "Practice",
                practiceSentiment:
                  practiceSentiment == "all"
                    ? "POSITIVE"
                    : practiceSentiment.toUpperCase(),
              },
            },
          },
        })
        .reprompt(say)
        .getResponse();
    } else {
      return handlerInput.responseBuilder
        .speak(say)
        .reprompt(
          `In one or two sentences, tell me something ${
            practiceSentiment == "all"
              ? "POSITIVE"
              : practiceSentiment.toUpperCase()
          }.`
        )
        .getResponse();
    }
  },
};

const StartGameHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "StartGameIntent"
    );
  },

  handle(handlerInput) {
    const responseBuilder = handlerInput.responseBuilder;
    var attributes = handlerInput.attributesManager.getSessionAttributes();
    const APLsupport = supportsAPL(handlerInput);
    attributes.gameScore = 0;
    attributes.level = 1;
    attributes.attempt = 0;
    attributes.sentimentIdx = 0;
    attributes.passed = [false, false];
    attributes.phase = "game";
    attributes.retryOffered = false;
    attributes.retryTaken = false;
    attributes.retryPenalty = 1.0;
    attributes.Level1round = 1;
    attributes.Level2round = 1;
    attributes.lastSay =
      " In one or two sentences, tell me something positive.";
    let say =
      "Starting Level One. In one or two sentences, tell me something positive.";

    /* build an APL screen for this */

    if (APLsupport) {
      const myDoc = require("./roundCard.json");
      return handlerInput.responseBuilder
        .speak(say)
        .addDirective({
          type: "Alexa.Presentation.APL.RenderDocument",
          token: "roundToken",
          document: myDoc,
          datasources: {
            roundData: {
              type: "object",
              properties: {
                level: "Level One",
              },
            },
          },
        })
        .reprompt(say)
        .getResponse();
    } else {
      return handlerInput.responseBuilder
        .speak(say)
        .reprompt("In one or two sentences, tell me something positive.")
        .getResponse();
    }
  },
};

const utteranceHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (
      request.type === "IntentRequest" &&
      request.intent.name === "UtteranceIntent"
    );
  },
  async handle(handlerInput) {
    const APLsupport = supportsAPL(handlerInput);
    var say = "";
    var reSay = "";
    var offerRetry = false;
    if (handlerInput.requestEnvelope.request.intent) {
      var attributes = handlerInput.attributesManager.getSessionAttributes();
      if (attributes.phase == "waiting" || attributes.phase == undefined) {
        say = "Say, practice, or, start game, to begin.";
        return handlerInput.responseBuilder
          .speak(say)
          .reprompt(say)
          .getResponse();
      }

      if (attributes.retryOffered && !attributes.retryTaken) {
        attributes.retryOffered = false;
        attributes.retryPenalty = 1.0;
      } else {
        attributes.retryOffered = false;
        attributes.retryTaken = false; // it has to be reset, but is this too early?
        handlerInput.attributesManager.setSessionAttributes(attributes);
      }
      let nextSentiment = "";
      const query =
        handlerInput.requestEnvelope.request.intent.slots.text.value;
      var attributes = handlerInput.attributesManager.getSessionAttributes();
      switch (attributes.level) {
        case 0: // PRACTICE
          try {
            var status;
            await callDirectiveService(handlerInput, "hang on. ");
          } catch (err) {
            // if it failed we can continue, just the user will wait longer for first response
            console.log(err);
          }

          return new Promise((resolve, reject) => {
            getSearchResults(handlerInput, query)
              .then((response) => {
                if (attributes.practiceMode == "all")
                  reSay = "Tell me something positive.";
                else {
                  reSay = `Tell me something ${attributes.practiceMode}.`;
                }
                var scores = [];
                var sentiment = response.sentiment;
                scores[0] = Math.round(
                  response.confidenceScores.positive * 100
                );
                scores[1] = Math.round(
                  response.confidenceScores.negative * 100
                );
                scores[2] = Math.round(response.confidenceScores.neutral * 100);
                let scoreColors = ["white", "white", "white", "white"];

                if (sentiments[attributes.sentimentIdx] == sentiment) {
                  say =
                    "<amazon:emotion name='excited' intensity='low'>" +
                    sayRandom(goods) +
                    "</amazon:emotion>. That was " +
                    sentiment +
                    " with a " +
                    sentiments[attributes.sentimentIdx] +
                    " value of " +
                    scores[attributes.sentimentIdx] +
                    " percent. ";
                  attributes.attempt = 0;
                  attributes.passed[attributes.sentimentIdx] = true;
                  if (attributes.practiceMode == "all")
                    attributes.sentimentIdx = (attributes.sentimentIdx + 1) % 3;
                } else {
                  say =
                    "That was " +
                    sentiment +
                    ". I was looking for " +
                    sentiments[attributes.sentimentIdx] +
                    ". ";
                  attributes.attempt += 1;

                  if (attributes.attempt < MAXATTEMPTS) {
                    reSay =
                      "Try again. Say something " +
                      sentiments[attributes.sentimentIdx] +
                      ". ";
                    attributes.lastSay =
                      "Say something " +
                      sentiments[attributes.sentimentIdx] +
                      ". ";
                    say += " Try again. ";
                  } else {
                    attributes.passed[attributes.sentimentIdx] = true;
                    if (attributes.practiceMode == "all")
                      attributes.sentimentIdx =
                        (attributes.sentimentIdx + 1) % 3;
                  }
                }

                if (attributes.passed[0] && attributes.passed[1]) {
                  attributes.passed[0] = attributes.passed[1] = false;
                  attributes.attempt = 0;
                }

                nextSentiment = sentiments[attributes.sentimentIdx];
                reSay = "Now say something " + nextSentiment;
                say += reSay;
                attributes.lastSay = reSay;

                handlerInput.attributesManager.setSessionAttributes(attributes);

                if (APLsupport) {
                  const myDoc = require("./scoreCard.json");

                  resolve(
                    handlerInput.responseBuilder
                      .speak(say)
                      .addDirective({
                        type: "Alexa.Presentation.APL.RenderDocument",
                        token: "sentimentToken",
                        document: myDoc,
                        datasources: {
                          sentimentData: {
                            type: "object",
                            properties: {
                              level: "Practice",
                              query: query.trunc(75, true),
                              sentiment: sentiment,
                              scoreColors: scoreColors,
                              scores: scores,
                              next: nextSentiment,
                              scoreType: "",
                              hintString: "start game",
                            },
                            transformers: [
                              {
                                inputPath: "hintString",
                                transformer: "textToHint",
                              },
                            ],
                          },
                        },
                      })
                      .reprompt(reSay)
                      .getResponse()
                  );
                } else {
                  resolve(
                    handlerInput.responseBuilder
                      .speak(say)
                      //.withShouldEndSession(true)
                      .reprompt(reSay)
                      .getResponse()
                  );
                }
              })
              .catch((error) => {
                console.log(error.message);

                resolve(
                  handlerInput.responseBuilder
                    .withShouldEndSession(false)
                    .speak(error.message)
                    .getResponse()
                );
              });
          });

        case 1: // ROUND ONE OF GAMEPLAY - MATCH SENTIMENT WITHOUT TARGET VALUE
          try {
            var status;
            await callDirectiveService(handlerInput, "hang on. ");
          } catch (err) {
            // if it failed we can continue, just the user will wait longer for first response
            console.log(err);
          }

          return new Promise((resolve, reject) => {
            getSearchResults(handlerInput, query)
              .then((response) => {
                var scores = [];
                var sentiment = response.sentiment;
                scores[0] = Math.round(
                  response.confidenceScores.positive * 100
                );
                scores[1] = Math.round(
                  response.confidenceScores.negative * 100
                );
                scores[2] = Math.round(response.confidenceScores.neutral * 100);
                let scoreColors = ["white", "white", "white", "white"];

                if (sentiments[attributes.sentimentIdx] == sentiment) {
                  say =
                    "<amazon:emotion name='excited' intensity='low'>" +
                    sayRandom(goods) +
                    "</amazon:emotion>. That was " +
                    sentiment +
                    " with a " +
                    sentiments[attributes.sentimentIdx] +
                    " value of " +
                    scores[attributes.sentimentIdx] +
                    " percent. ";
                  attributes.passed[attributes.sentimentIdx] = true;
                  let thisScore = 5 - 2 * attributes.attempt;
                  attributes.gameScore += 5 - 2 * attributes.attempt;
                  let pointPlural = "";
                  if (thisScore != 1) pointPlural = "s";
                  let gScorePlural = "";
                  if (attributes.gameScore != 1) gScorePlural = "s";

                  say +=
                    "You get " +
                    thisScore +
                    " point" +
                    pointPlural +
                    ". Your score is now " +
                    attributes.gameScore +
                    " point" +
                    gScorePlural +
                    ". ";
                } else {
                  say =
                    "That was " +
                    sentiment +
                    ". I was looking for " +
                    sentiments[attributes.sentimentIdx] +
                    ". ";
                  attributes.attempt += 1;

                  if (attributes.attempt < MAXATTEMPTS) {
                    say += "Try again. ";

                    reSay =
                      "Try again. Say something " +
                      sentiments[attributes.sentimentIdx] +
                      ". ";
                    attributes.lastSay =
                      "Say something " +
                      sentiments[attributes.sentimentIdx] +
                      ". ";
                    // say += attributes.lastSay;
                  } else {
                    let gScorePlural = "";
                    if (attributes.gameScore != 1) gScorePlural = "s";
                    attributes.passed[attributes.sentimentIdx] = true;
                    say +=
                      " You get zero points for " +
                      sentiments[attributes.sentimentIdx] +
                      ". Your score is now " +
                      attributes.gameScore +
                      " point" +
                      gScorePlural +
                      ". ";
                  }
                }
                let value = 0;
                let newRound = false;
                if (
                  attributes.passed[0] &&
                  attributes.passed[1] &&
                  attributes.passed[2]
                ) {
                  attributes.passed[0] = false;
                  attributes.passed[1] = false;
                  attributes.passed[2] = false;
                  newRound = true;
                  attributes.Level1round = attributes.Level1round + 1;
                }
                if (attributes.Level1round > 2) {
                  attributes.Level1round = 1;
                  value = randomIntFromInterval(31, 100);
                  say +=
                    "Welcome to level 2. Your goal is to match Azure's measurement for the sentiment. Tell me something positive with a positive value of " +
                    value +
                    " percent.";
                  attributes.lastSay =
                    "Tell me something positive with a positive value of " +
                    value +
                    " percent.";
                  reSay = attributes.lastSay;

                  attributes.level = 2;
                  attributes.attempt = 0;
                  attributes.targetValue = value;
                  attributes.sentimentIdx = 0;
                  nextSentiment = attributes.next = "positive";
                  attributes.next = "positive"; // always start positive!
                  attributes.passed = [false, false, false];
                } else {
                  if (
                    attributes.attempt >= MAXATTEMPTS ||
                    attributes.passed[attributes.sentimentIdx] == true ||
                    newRound == true
                  ) {
                    attributes.sentimentIdx = (attributes.sentimentIdx + 1) % 3; // do I need the mod?
                    attributes.attempt = 0;
                    say +=
                      "Now say something " +
                      sentiments[attributes.sentimentIdx];
                  } else {
                    say +=
                      "Say something " + sentiments[attributes.sentimentIdx];
                  }

                  attributes.lastSay =
                    "Say something " + sentiments[attributes.sentimentIdx];

                  reSay = attributes.lastSay;

                  nextSentiment = sentiments[attributes.sentimentIdx];
                }

                handlerInput.attributesManager.setSessionAttributes(attributes);

                //console.log(response);
                const myDoc = require("./scoreCard.json");
                if (APLsupport) {
                  resolve(
                    handlerInput.responseBuilder
                      .speak(say)
                      .addDirective({
                        type: "Alexa.Presentation.APL.RenderDocument",
                        token: "sentimentToken",
                        document: myDoc,
                        datasources: {
                          sentimentData: {
                            type: "object",
                            properties: {
                              level: "Level 1",
                              query: query.trunc(75, true),
                              sentiment: sentiment,
                              scoreColors: scoreColors,
                              scores: scores,
                              next: nextSentiment,
                              value: value,
                              scoreType: "",
                              gameScore:
                                "CURRENT SCORE: " + attributes.gameScore,
                            },
                          },
                        },
                      })
                      .reprompt(reSay)
                      .getResponse()
                  );
                } else {
                  resolve(
                    handlerInput.responseBuilder
                      .speak(say)
                      //.withShouldEndSession(true)
                      .reprompt(reSay)
                      .getResponse()
                  );
                }
              })
              .catch((error) => {
                console.log(error.message);

                resolve(
                  handlerInput.responseBuilder
                    .withShouldEndSession(false)
                    .speak(error.message)
                    .getResponse()
                );
              });
          });
        case 2: // LEVEL TWO: MATCH BOTH SENTIMENT AND TARGET VALUE
          return new Promise((resolve, reject) => {
            getSearchResults(handlerInput, query)
              .then((response) => {
                var scores = [];
                var sentiment = response.sentiment;
                scores[0] = Math.round(
                  response.confidenceScores.positive * 100
                );
                scores[1] = Math.round(
                  response.confidenceScores.negative * 100
                );
                scores[2] = Math.round(response.confidenceScores.neutral * 100);
                let scoreColors = ["white", "white", "white", "white"];

                let scoreType = "CURRENT";
                if (sentiments[attributes.sentimentIdx] == sentiment) {
                  say =
                    " Your goal for " +
                    sentiment +
                    " was a value of " +
                    attributes.targetValue +
                    " percent. Your statement had a " +
                    sentiment +
                    " value of " +
                    scores[attributes.sentimentIdx] +
                    " percent. ";

                  // degrees of difficulty
                  let diffDegree = 1.0;

                  if (attributes.targetValue >= 90) diffDegree = 1.0;
                  else if (attributes.targetValue >= 80) diffDegree = 1.25;
                  else if (attributes.targetValue >= 70) diffDegree = 1.5;
                  else if (attributes.targetValue >= 60) diffDegree = 1.75;
                  else if (attributes.targetValue >= 50) diffDegree = 2.0;

                  if (
                    scores[attributes.sentimentIdx] == attributes.targetValue
                  ) {
                    attributes.gameScore += Math.round(
                      20 * diffDegree * attributes.retryPenalty
                    );
                    say += "You nailed it! ";
                    say +=
                      "You get " + Math.round(20 * diffDegree) + " points. ";
                  } else {
                    let thisScore = 0;
                    if (
                      Math.abs(
                        attributes.targetValue - scores[attributes.sentimentIdx]
                      ) < 10
                    ) {
                      thisScore = Math.round(
                        10 * diffDegree * attributes.retryPenalty
                      );
                      attributes.gameScore += thisScore;
                    } // TODO Starting here, offer the option of retrying this target
                    else if (
                      Math.abs(
                        attributes.targetValue - scores[attributes.sentimentIdx]
                      ) < 20
                    ) {
                      offerRetry = true;
                      thisScore = Math.round(
                        5 * diffDegree * attributes.retryPenalty
                      );
                      attributes.gameScore += thisScore;
                    } else offerRetry = true;

                    say +=
                      "You " +
                      (attributes.targetValue > scores[attributes.sentimentIdx]
                        ? " undershot "
                        : " overshot ") +
                      " by " +
                      Math.abs(
                        attributes.targetValue - scores[attributes.sentimentIdx]
                      ) +
                      " percent. ";

                    let pointPlural = "";
                    if (thisScore != 1) pointPlural = "s";
                    say +=
                      "You get " + thisScore + " point" + pointPlural + ". ";
                  }
                  attributes.passed[attributes.sentimentIdx] = true;
                  const tv = attributes.targetValue;

                  const si = attributes.sentimentIdx;
                  attributes.sockAway = {
                    targetValue: tv,
                    sentimentIdx: si,
                  };
                  handlerInput.attributesManager.setSessionAttributes(
                    attributes
                  );

                  //let value = randomIntFromInterval(1, 100);
                  //attributes.targetValue = value; // is this being done twice?
                  if (
                    attributes.passed[0] &&
                    attributes.passed[1] &&
                    attributes.passed[2]
                  ) {
                    attributes.passed[0] = false;
                    attributes.passed[1] = false;
                    attributes.passed[2] = false;
                    attributes.Level2round = attributes.Level2round + 1;
                  }

                  if (attributes.Level2round > 2) {
                    let gScorePlural = "";
                    if (attributes.gameScore != 1) gScorePlural = "s";
                    say +=
                      "Your final score was " +
                      attributes.gameScore +
                      " point" +
                      gScorePlural +
                      ". ";
                    //repromptSay = "Say, exit, to exit.";
                    scoreType = "FINAL";
                    // at this point, see if the new score is higher than any old saved high score
                    if (attributes.gameScore > attributes.hiScore) {
                      attributes.newHi = true;
                      say +=
                        " That is a new high score for you! Come back again and see if you can top that. ";
                      let pAttributes = { hiScore: attributes.gameScore };
                      handlerInput.attributesManager.setPersistentAttributes(
                        pAttributes
                      );
                      handlerInput.attributesManager.savePersistentAttributes();
                    } else {
                      attributes.newHi = false;
                    }
                    say += " Goodbye! ";

                    attributes.level = 2;
                    attributes.sentimentIdx = 0;
                  } else {
                    let gScorePlural = "";
                    if (attributes.gameScore != 1) gScorePlural = "s";
                    say +=
                      " Your score is now " +
                      attributes.gameScore +
                      " point" +
                      gScorePlural +
                      ". ";

                    attributes.sentimentIdx = (attributes.sentimentIdx + 1) % 3;
                    nextSentiment = sentiments[attributes.sentimentIdx];

                    attributes.targetValue = randomIntFromInterval(50, 100);
                    // nextTarget = attributes.targetValue;

                    // need to preserve the next one as we're about to offer it, but also preserve the last one in case there's a call to try again/
                    // and we won't want to redraw the APL with a new thing
                    // and we don't care if after a retry the newer goal is not the dame
                    if (offerRetry == true) {
                      attributes.retryOffered = true;
                      say += " Say, try again, to repeat that goal, or else ";
                    } else say += " Now ";
                    reSay +=
                      " say something " +
                      sentiments[attributes.sentimentIdx] +
                      " with a " +
                      sentiments[attributes.sentimentIdx] +
                      " value of " +
                      attributes.targetValue +
                      " percent. ";
                    say += reSay;
                    attributes.lastSay = reSay;
                  }
                  handlerInput.attributesManager.setSessionAttributes(
                    attributes
                  );
                } else {
                  nextSentiment = sentiments[attributes.sentimentIdx];
                  reSay =
                    "Say something " +
                    sentiments[attributes.sentimentIdx] +
                    " with a " +
                    sentiments[attributes.sentimentIdx] +
                    " value of " +
                    attributes.targetValue +
                    " percent. ";
                  if (sentiment == "UNKNOWN") {
                    say =
                      "I'm sorry but I don't know the sentiment of that. Try again. " +
                      reSay;
                    scoreColors[maxScore] = "white";
                  } else {
                    say =
                      "That was " +
                      sentiment +
                      ". I was looking for " +
                      sentiments[attributes.sentimentIdx] +
                      ". Try again. " +
                      reSay;
                  }

                  attributes.lastSay = reSay;
                }
                //console.log(response);
                if (scoreType == "FINAL") {
                  attributes.phase = "waiting"; // waiting to start new game or practice
                  handlerInput.attributesManager.setSessionAttributes(
                    attributes
                  );
                  if (APLsupport) {
                    const myDoc = require("./scoreCard.json");
                    resolve(
                      handlerInput.responseBuilder
                        .speak(say)
                        .addDirective({
                          type: "Alexa.Presentation.APL.RenderDocument",
                          token: "sentimentToken",
                          document: myDoc,
                          datasources: {
                            sentimentData: {
                              type: "object",
                              properties: {
                                level: "Level 2",
                                query: query.trunc(75, true),
                                sentiment: sentiment,
                                scoreColors: scoreColors,
                                scores: scores,
                                scoreType: scoreType,
                                newHi: attributes.newHi,
                                gameScore:
                                  scoreType + " SCORE: " + attributes.gameScore,
                              },
                            },
                          },
                        })
                        .withShouldEndSession(true)
                        .getResponse()
                    );
                  } else {
                    resolve(
                      handlerInput.responseBuilder
                        .speak(say)
                        .withShouldEndSession(true)
                        .getResponse()
                    );
                  }
                } else {
                  if (APLsupport) {
                    const myDoc = require("./scoreCard.json");
                    resolve(
                      handlerInput.responseBuilder
                        .speak(say)
                        .addDirective({
                          type: "Alexa.Presentation.APL.RenderDocument",
                          token: "sentimentToken",
                          document: myDoc,
                          datasources: {
                            sentimentData: {
                              type: "object",
                              properties: {
                                level: "Level 2",
                                query: query.trunc(75, true),
                                sentiment: sentiment,
                                scoreColors: scoreColors,
                                scores: scores,
                                scoreType: scoreType,
                                gameScore:
                                  scoreType + " SCORE: " + attributes.gameScore,
                                next: nextSentiment,
                                nextTarget: attributes.targetValue,
                              },
                            },
                          },
                        })
                        .reprompt(reSay)
                        .getResponse()
                    );
                  } else {
                    resolve(
                      handlerInput.responseBuilder
                        .speak(say)
                        .reprompt(reSay)
                        .getResponse()
                    );
                  }
                }
              })
              .catch((error) => {
                console.log(error.message);

                resolve(
                  handlerInput.responseBuilder
                    .withShouldEndSession(false)
                    .speak(error.message)
                    .getResponse()
                );
              });
          });

        case 3:
          return handlerInput.responseBuilder
            .speak("welcome to level 3.")
            .reprompt("try again, ")
            .getResponse();
        default:
      }
    }
  },
};

const RepeatIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" && request.intent.name === "RepeatIntent"
    );
  },

  handle(handlerInput) {
    var attributes = handlerInput.attributesManager.getSessionAttributes();

    if (attributes.phase == "waiting" || attributes.phase == undefined) {
      return handlerInput.responseBuilder
        .speak("Say, practice, or, start game, to begin. ")
        .reprompt("Say, practice, or, start game, to begin. ")
        .getResponse();
    }
    if (attributes.lastSay != "")
      return handlerInput.responseBuilder
        .speak(attributes.lastSay)
        .reprompt(attributes.lastSay)
        .getResponse();
    else
      return handlerInput.responseBuilder
        .speak("I'm sorry, but I can't do that. ")
        .reprompt("Keep going. ")
        .getResponse();
  },
};

const TryAgainIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "TryAgainIntent"
    );
  },

  handle(handlerInput) {
    var attributes = handlerInput.attributesManager.getSessionAttributes();
    let say = "";
    attributes.retry = true;
    if (attributes.phase == "waiting" || attributes.phase == undefined) {
      return handlerInput.responseBuilder
        .speak("Say, practice, or, start game, to begin. ")
        .reprompt("Say, practice, or, start game, to begin. ")
        .getResponse();
    }
    //                     attributes.sockAway = {"nextTarget": nextTarget, "sentimentIdx":attributes.sentimentIdx};

    if (!attributes.retryOffered || attributes.retryOffered == undefined) {
      return handlerInput.responseBuilder
        .speak(" I didn't say you could try again. " + attributes.lastSay)
        .reprompt(attributes.lastSay)
        .getResponse();
    }
    if (attributes.lastSay != "") {
      if (attributes.retryPenalty > 0) {
        attributes.retryPenalty -= 0.1;
        attributes.retryTaken = true;
      }

      attributes.sentimentIdx = attributes.sockAway.sentimentIdx;
      attributes.targetValue = attributes.sockAway.targetValue;

      say = ` Say something ${
        sentiments[attributes.sockAway.sentimentIdx]
      } with a value of  ${attributes.sockAway.targetValue} percent. `;
      attributes.lastSay = say;
      handlerInput.attributesManager.setSessionAttributes(attributes);

      return handlerInput.responseBuilder
        .speak(say)
        .reprompt(say)
        .getResponse();
    } else
      return handlerInput.responseBuilder
        .speak("I'm sorry, but I can't do that. ")
        .reprompt("Keep going. ")
        .getResponse();
  },
};

const FallbackHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "AMAZON.FallbackIntent"
    );
  },

  handle(handlerInput) {
    var attributes = handlerInput.attributesManager.getSessionAttributes();

    if (attributes.phase == "waiting" || attributes.phase == undefined) {
      return handlerInput.responseBuilder
        .speak(HELP_MESSAGE_WAITING)
        .reprompt(HELP_REPROMPT_WAITING)
        .getResponse();
    }
    return handlerInput.responseBuilder
      .speak("hmm I'm not sure I got that")
      .reprompt("say again")
      .getResponse();
  },
};

const ResetScoreIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "ResetScoreIntent"
    );
  },

  async handle(handlerInput) {
    var attributes = handlerInput.attributesManager.getSessionAttributes();

    if (
      attributes.phase == "waiting" ||
      attributes.phase == "practice" ||
      attributes.phase == undefined
    ) {
      attributes.hiScore = 0;
      handlerInput.attributesManager.setSessionAttributes(attributes);

      let say = "High score reset to zero. Please continue. ";
      if (attributes.phase == "waiting")
        say += "Say, practice, or, start game, to begin.";
      if (attributes.phase == "practice") say += attributes.lastSay;

      let pAttributes = { hiScore: 0 };
      handlerInput.attributesManager.setPersistentAttributes(pAttributes);
      await handlerInput.attributesManager.savePersistentAttributes();
      return handlerInput.responseBuilder
        .speak(say)
        .reprompt(say)
        .getResponse();
    } //else
    return handlerInput.responseBuilder
      .speak(
        "You can only reset your high score before starting the game. Please continue. " +
          attributes.lastSay
      )
      .reprompt("Please continue. " + attributes.lastSay)
      .getResponse();
  },
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    var attributes = handlerInput.attributesManager.getSessionAttributes();

    if (attributes.phase == "waiting" || attributes.phase == undefined) {
      return handlerInput.responseBuilder
        .speak(HELP_MESSAGE_WAITING)
        .reprompt(HELP_REPROMPT_WAITING)
        .getResponse();
    }
    return handlerInput.responseBuilder
      .speak(HELP_MESSAGE_INGAME)
      .reprompt(HELP_REPROMPT_INGAME)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      (request.intent.name === "AMAZON.CancelIntent" ||
        request.intent.name === "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak("Goodbye!")
      .withShouldEndSession(true)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === "SessionEndedRequest";
  },
  handle(handlerInput) {
    console.log(
      `Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`
    );
    console.log(
      `Session ended with reason: ${handlerInput.requestEnvelope.request.type}`
    );

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak("Sorry, an error happened.")
      .reprompt("Sorry, an error did happen.")
      .getResponse();
  },
};

async function getSearchResults(handlerInput, query) {
  var attributes = handlerInput.attributesManager.getSessionAttributes();
  const textAnalyticsClient = new TextAnalyticsClient(
    endpoint,
    new AzureKeyCredential(key)
  );
  const sentimentInput = [query];
  const sentimentResult = await textAnalyticsClient.analyzeSentiment(
    sentimentInput
  );
  //console.log("Sentiment Result: ", JSON.stringify(sentimentResult[0]));

  return {
    sentiment: sentimentResult[0].sentiment,
    confidenceScores: {
      positive: sentimentResult[0].confidenceScores.positive,
      negative: sentimentResult[0].confidenceScores.negative,
      neutral: sentimentResult[0].confidenceScores.neutral,
    },
  };
  sentimentResult.forEach((document) => {
    console.log(`ID: ${document.id}`);
    console.log(`\tDocument Sentiment: ${document.sentiment}`);
    console.log(`\tDocument Scores:`);
    console.log(
      `\t\tPositive: ${document.confidenceScores.positive.toFixed(
        2
      )} \tNegative: ${document.confidenceScores.negative.toFixed(
        2
      )} \tNeutral: ${document.confidenceScores.neutral.toFixed(2)}`
    );
    console.log(`\tSentences Sentiment(${document.sentences.length}):`);
    document.sentences.forEach((sentence) => {
      console.log(`\t\tSentence sentiment: ${sentence.sentiment}`);
      console.log(`\t\tSentences Scores:`);
      console.log(
        `\t\tPositive: ${sentence.confidenceScores.positive.toFixed(
          2
        )} \tNegative: ${sentence.confidenceScores.negative.toFixed(
          2
        )} \tNeutral: ${sentence.confidenceScores.neutral.toFixed(2)}`
      );
    });
  });
}

async function callDirectiveService(handlerInput, speech) {
  // Call Alexa Directive Service.
  const requestEnvelope = handlerInput.requestEnvelope;
  const directiveServiceClient = handlerInput.serviceClientFactory.getDirectiveServiceClient();

  const requestId = requestEnvelope.request.requestId;
  const endpoint = requestEnvelope.context.System.apiEndpoint;
  const token = requestEnvelope.context.System.apiAccessToken;

  // build the progressive response directive
  const directive = {
    header: {
      requestId,
    },
    directive: {
      type: "VoicePlayer.Speak",
      speech: `<speak><audio src="${process.env.SOUNDURL}" /></speak>`,
    },
  };

  // send directive
  return directiveServiceClient.enqueue(directive, endpoint, token);
}

function sayRandom(theArray) {
  return theArray[Math.floor(Math.random() * theArray.length)];
  //return theArray[(theArray.length * Math.random()) | 0];
}

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function indexOfMax(arr) {
  if (arr.length === 0) {
    return -1;
  }

  var max = arr[0];
  var maxIndex = 0;

  for (var i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      maxIndex = i;
      max = arr[i];
    }
  }

  return maxIndex;
}

function safeStringify(obj, indent = 2) {
  let cache = [];
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === "object" && value !== null
        ? cache.includes(value)
          ? undefined // Duplicate reference found, discard key
          : cache.push(value) && value // Store value in our collection
        : value,
    indent
  );
  cache = null;
  return retVal;
}

function supportsAPL(handlerInput) {
  const supportedInterfaces =
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces;
  const aplInterface = supportedInterfaces["Alexa.Presentation.APL"];
  return aplInterface != null && aplInterface !== undefined;
}

String.prototype.trunc = function (n, useWordBoundary) {
  if (this.length <= n) {
    return this;
  }
  var subString = this.substr(0, n - 1);
  return (
    (useWordBoundary
      ? subString.substr(0, subString.lastIndexOf(" "))
      : subString) + "…"
  );
};

const RequestLog = {
  async process(handlerInput) {
    console.log(
      "REQUEST ENVELOPE = " + JSON.stringify(handlerInput.requestEnvelope)
    );
  },
};

const ResponseLog = {
  process(handlerInput) {
    console.log(
      "RESPONSE BUILDER = " +
        JSON.stringify(handlerInput.responseBuilder.getResponse())
    );
  },
};

const HELP_MESSAGE_INGAME =
  "In Sentiment Blue you will try to match Microsoft Azure's sentiment measurements to specific goals, by making positive, negative or neutral statements. The clocer you match the goals, the higher your score. You may not always agree with Azure's measurements. That's OK! The challenge is to try to match as best you can. Say, practice, or, start game, to begin, or match the sentiment goal to continue the game.";
const HELP_REPROMPT_INGAME =
  "Say, practice, or, start game, to begin a new game, or match the sentiment goal to continue the game.";

const HELP_MESSAGE_WAITING =
  "In Sentiment Blue you will try to match Microsoft Azure's sentiment measurements to specific goals, by making positive, negative or neutral statements. The clocer you match the goals, the higher your score. You may not always agree with Azure's measurements. That's OK! The challenge is to try to match as best you can. Say, practice, or, start game, to begin.";
const HELP_REPROMPT_WAITING =
  "Say, practice, or, start game, to begin a new game.";

const goods = ["good", "all right", "very good", "okay"];

const skillBuilder = Alexa.SkillBuilders.standard();

exports.handler = Alexa.SkillBuilders.custom()
  .withPersistenceAdapter(
    new persistenceAdapter.S3PersistenceAdapter({
      bucketName: process.env.PBUCKET,
    })
  )
  .addRequestHandlers(
    HelpHandler,
    ExitHandler,
    LaunchRequestHandler,
    SessionEndedRequestHandler,
    FallbackHandler,
    RepeatIntentHandler,
    TryAgainIntentHandler,
    PracticeIntentHandler,
    StartGameHandler,
    ResetScoreIntentHandler,
    utteranceHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .addRequestInterceptors(RequestLog)
  .addResponseInterceptors(ResponseLog)
  .lambda();
