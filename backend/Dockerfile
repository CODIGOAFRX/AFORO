FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 aforo
WORKDIR /app
COPY --from=build /build/target/aforo-0.1.0-SNAPSHOT.jar app.jar
USER aforo
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
