import axios, { AxiosError } from "axios";
import { parseCookies, setCookie } from "nookies";
import { signOut } from "../contexts/AuthContext";
import { AuthTokenError } from "./errors/AuthTokenError";

//Deixando variavel como let para poder modicar o valor dela
// Como por ex: fazendo refresh do token
let isRefreshhing = false;
let failedRequestsQueue = [];
/**
 * @param {*} ctx Contexto
 */

export function setupAPIClient(ctx = undefined) {
  let cookies = parseCookies(ctx);

  //Executa uma unica vez quando usuário abre a tela
  const api = axios.create({
    baseURL: "http://localhost:3333",
    // token para autenticar rotas
    headers: {
      Authorization: `Bearer ${cookies["nextauth.token"]}`,
    },
  });

  //Esperando a resposta do back-end
  api.interceptors.response.use(
    (response) => {
      return response; //success
    },
    (error: AxiosError) => {
      // reponse deu error
      if (error.response.status === 401) {
        if (error.response.data?.code === "token.expired") {
          //renovar token
          cookies = parseCookies(ctx);

          const { "nextauth.refreshToken": refreshToken } = cookies;
          const originalConfig = error.config;

          if (!isRefreshhing) {
            isRefreshhing = true;
            api
              .post("/refresh", {
                refreshToken, // passando refreshToken para atualizar o token
              })
              .then((response) => {
                const token = response.data.token;

                //ladoBrowser, nomeToken , valorToken
                setCookie(ctx, "nextauth.token", token, {
                  maxAge: 60 * 60 * 24 * 30, // 30 days
                  path: "/", // qualquer endereço para aplicação
                });
                setCookie(
                  ctx,
                  "nextauth.refreshToken",
                  response.data.refresToken,
                  {
                    maxAge: 60 * 60 * 24 * 30, // 300 days
                    path: "/", // qualquer endereço para aplicação
                  }
                );

                api.defaults.headers["Authorization"] = `Bearer ${token}`;

                failedRequestsQueue.forEach((request) =>
                  request.onSuccess(token)
                );
                failedRequestsQueue = [];

                //lado do cliente
                if (process.browser) {
                  signOut();
                }
              })
              .catch((err) => {
                failedRequestsQueue.forEach((request) =>
                  request.onFailure(err)
                );
                failedRequestsQueue = [];
              })
              .finally(() => {
                isRefreshhing = false;
              });
          }

          return new Promise((resolve, reject) => {
            failedRequestsQueue.push({
              onSuccess: (token: string) => {
                originalConfig.headers["Authorization"] = `Bearer ${token}`;
                resolve(api(originalConfig));
              },
              onFailure: (err: AxiosError) => {
                reject(err);
              },
            });
          });
        } else {
          //lado do cliente
          if (process.browser) {
            signOut();
          } else {
            return Promise.reject(new AuthTokenError());
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return api;
}
